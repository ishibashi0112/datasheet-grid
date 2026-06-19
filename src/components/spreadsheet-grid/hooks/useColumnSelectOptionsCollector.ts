import { useEffect, useMemo, useState } from 'react';
import type { GridColumn } from '../model/gridTypes';
import { yieldToMain } from '../utils/scheduler';
import { collectSelectOptions, createSelectOptionsAccumulator, type SelectOptionEntry } from '../logic/selectOptions';

// 1 チャンクで連続走査する時間予算(ms)です(autosize ランナーと同値)。
const CHUNK_BUDGET_MS = 10;
// 同期一括で収集する行数の上限です。これ以下は従来どおり open レンダーの useMemo で
//   即時確定し(チラつきなし・バイト等価)、超えたぶんだけ時間分割の非同期収集に倒します。
//   500k/1M の同期スキャン(≈0.4s/≈0.8〜1s)が主スレッドを塞ぐのを避ける一方、通常規模の
//   体感(open 即リスト表示)は一切変えないための分岐点です。
export const ASYNC_SELECT_COLLECT_ROW_THRESHOLD = 50_000;

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

const EMPTY_OPTIONS: SelectOptionEntry[] = [];
const EMPTY_VALUES: ReadonlySet<string> = new Set<string>();

export type ColumnSelectOptionsStatus = 'idle' | 'collecting' | 'ready';

export type ColumnSelectOptionsResult = {
  status: ColumnSelectOptionsStatus;
  options: SelectOptionEntry[];
  // 全候補値の集合(ready のときのみ完全)。トグル/Select All の universe 判定に使います。
  allValues: ReadonlySet<string>;
  // collecting 中の進捗(0..1)。ready は 1 / idle は 0。
  progress: number;
};

// idle / 収集開始直後(キー未一致)の安定参照です。新規生成を避けて不要レンダーを抑えます。
const IDLE_RESULT: ColumnSelectOptionsResult = {
  status: 'idle',
  options: EMPTY_OPTIONS,
  allValues: EMPTY_VALUES,
  progress: 0,
};
const COLLECTING_INITIAL: ColumnSelectOptionsResult = {
  status: 'collecting',
  options: EMPTY_OPTIONS,
  allValues: EMPTY_VALUES,
  progress: 0,
};

type RawValueAccessor = (index: number) => unknown;

type UseColumnSelectOptionsCollectorArgs<T> = {
  // popover を開いている列(null = 閉。select/set 以外は idle)。
  column: GridColumn<T> | null;
  // 候補収集の母集合の行数(= 全ソース行 rows.length。フィルター後の件数ではありません)。
  rowCount: number;
  // rows[index] の対象列セル値を返すアクセサ(= getCellValue(rows[index], column))。
  //   この identity が変わったとき(= rows/column が変化)に収集をやり直します(旧 [rows] 依存と等価)。
  getRawValueAt: RawValueAccessor;
};

const buildValueSet = (options: SelectOptionEntry[]): ReadonlySet<string> =>
  new Set(options.map((option) => option.value));

// 非同期収集結果は「どの収集に対する結果か」をキー(source/rowCount)付きで持ちます。
//   レンダー時に現在のキーと照合し、不一致(別列を開いた直後の 1 レンダー等)なら stale と
//   みなして collecting を返すため、直前列の候補が一瞬見える問題を防ぎます。あわせて、
//   この方式により effect 本体での同期 setState(set-state-in-effect)も不要になります。
type AsyncCollectState = {
  source: RawValueAccessor | null;
  rowCount: number;
  result: ColumnSelectOptionsResult;
};
const IDLE_ASYNC_STATE: AsyncCollectState = {
  source: null,
  rowCount: 0,
  result: IDLE_RESULT,
};

// 追加(DS-4 #1): select / set 候補を「通常規模=同期 / 大規模=時間分割の非同期」で収集します。
//   - 同期経路: 旧 getColumnSelectOptions と同じ open レンダー 1 回きりの useMemo(チラつき無)。
//   - 非同期経路: yieldToMain で主スレッドを塞がずチャンク収集し、effect cleanup の cancelled
//     フラグで後続 run / unmount / 母集合変化に対し安全に中断します。
//   - どちらも logic/selectOptions の共有コレクタを使うため、結果はバイト等価です。
export const useColumnSelectOptionsCollector = <T,>({
  column,
  rowCount,
  getRawValueAt,
}: UseColumnSelectOptionsCollectorArgs<T>): ColumnSelectOptionsResult => {
  const filterType = column?.filterType ?? null;
  const isSelectLike = filterType === 'select' || filterType === 'set';
  const explicitOptions =
    column?.filterOptions && column.filterOptions.length > 0
      ? column.filterOptions
      : null;
  const needsAsync =
    isSelectLike &&
    explicitOptions === null &&
    rowCount > ASYNC_SELECT_COLLECT_ROW_THRESHOLD;

  // 同期で確定できるケースはここで即時決定します(従来挙動・チラつきなし)。
  //   needsAsync のときだけ null を返し、下の effect 経路へ委ねます。
  const syncResult = useMemo<ColumnSelectOptionsResult | null>(() => {
    if (!column || !isSelectLike) {
      return IDLE_RESULT;
    }
    if (explicitOptions) {
      const options = explicitOptions as SelectOptionEntry[];
      return {
        status: 'ready',
        options,
        allValues: buildValueSet(options),
        progress: 1,
      };
    }
    if (!needsAsync) {
      const options = collectSelectOptions(rowCount, getRawValueAt);
      return {
        status: 'ready',
        options,
        allValues: buildValueSet(options),
        progress: 1,
      };
    }
    return null;
    // getRawValueAt の identity 変化(= rows/column 変化)で同期収集をやり直します(旧 [rows] と等価)。
  }, [column, isSelectLike, explicitOptions, needsAsync, rowCount, getRawValueAt]);

  const [asyncState, setAsyncState] =
    useState<AsyncCollectState>(IDLE_ASYNC_STATE);

  useEffect(() => {
    // 同期で確定済み(syncResult!==null)なら非同期 run は不要です。進行中の run があっても、
    //   この effect 再実行に伴う直前 cleanup(下の return)で既に中断されています。
    if (syncResult !== null) {
      return;
    }

    // この run のキー。collecting/ready の setAsyncState はこのキー付きで行い、レンダー側で照合します。
    const myKey = getRawValueAt;
    const myRowCount = rowCount;
    const accumulator = createSelectOptionsAccumulator();
    // 収集開始時の collecting 表示は、レンダー時フォールバック(下記 asyncResult 導出)が担います。
    //   effect 本体での同期 setState を避けるため、ここでは run を起動するだけにします。
    let cancelled = false;

    const run = async (): Promise<void> => {
      let index = 0;
      while (index < myRowCount) {
        const sliceStart = now();
        while (index < myRowCount && now() - sliceStart < CHUNK_BUDGET_MS) {
          accumulator.collect(myKey(index));
          index += 1;
        }
        if (index < myRowCount) {
          await yieldToMain();
          // yield 後の中断判定(後続 run / unmount / 母集合変化で cleanup が cancelled を立てる)。
          if (cancelled) {
            return;
          }
          setAsyncState({
            source: myKey,
            rowCount: myRowCount,
            result: {
              status: 'collecting',
              options: EMPTY_OPTIONS,
              allValues: EMPTY_VALUES,
              progress: index / myRowCount,
            },
          });
        }
      }
      if (cancelled) {
        return;
      }
      const options = accumulator.finalize();
      setAsyncState({
        source: myKey,
        rowCount: myRowCount,
        result: {
          status: 'ready',
          options,
          allValues: buildValueSet(options),
          progress: 1,
        },
      });
    };
    void run();

    return () => {
      // effect 再実行 / unmount: 進行中 run を次の yield 後に中断させます。
      cancelled = true;
    };
  }, [syncResult, rowCount, getRawValueAt]);

  // 非同期結果はキー一致時のみ採用します。不一致(別列を開いた直後等)は stale とみなし
  //   collecting(0%)を返し、直前列の候補表示と effect 内同期 setState の双方を避けます。
  const asyncResult: ColumnSelectOptionsResult =
    asyncState.source === getRawValueAt && asyncState.rowCount === rowCount
      ? asyncState.result
      : COLLECTING_INITIAL;

  return syncResult ?? asyncResult;
};

export default useColumnSelectOptionsCollector;