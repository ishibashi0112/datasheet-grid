import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { GlobalFilterStatus, GridColumn } from '../model/gridTypes';
import { yieldToMain } from '../utils/scheduler';
import {
  filterOrderByGlobalText,
  rowMatchesGlobalText,
  type RowOrder,
} from '../logic/filtering';

// 1 チャンクで連続走査する時間予算(ms)です(autosize ランナー / select collector と同値)。
const CHUNK_BUDGET_MS = 10;

// 同期一括で処理する行数の上限です。これ以下は従来どおりレンダーの useMemo で即時確定し
//   (チラつき無し・現状とバイト等価)、超えたぶんだけ時間分割の非同期スキャンに倒します。
//   1M 行 × 全表示列の同期スキャン(数百 ms)が主スレッドを塞ぐのを避ける一方、通常規模の
//   体感(入力即反映・即結果)は一切変えないための分岐点です。select collector と同値(行基準)。
//   条件は `rows.length > 50000` のため、50,000 行 = 同期 / 50,001 行 = 非同期です。
//   注記: グローバルフィルタの実コストは「行 × 表示列数」のため、列が極端に多い場合は行基準より
//   早く重くなります。まずは行基準の単純なしきい値で運用し、必要ならセル基準へ移せます
//   (後から定数差し替えのみで切替可能)。
export const ASYNC_GLOBAL_FILTER_ROW_THRESHOLD = 50_000;

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export type GlobalFilteredOrderResult = {
  // 現在表示すべきビュー順です(計算中は前回確定 order を維持します)。
  order: RowOrder;
  // 適用状態です。大規模データの時間分割中のみ 'filtering'。空/無効は 'idle'、確定は 'ready'。
  status: GlobalFilterStatus;
  // 0..1。filtering 中のみ意味を持ち、ready / idle では 1 です。
  progress: number;
};

// 直近に「完了した」非同期結果です(前回結果維持＝計算中はこの order を表示する種)。完了時のみ更新。
//   入力スナップショット(rows / baseOrder / columns / needle)を併せ持ち、レンダー時に現在入力と
//   identity 照合します。一致すれば「現在入力の結果が確定済み」(ready)、不一致なら「前回の確定結果」
//   として fallback 表示に使います(rowsLength で index 安全を担保)。
type AsyncReadyState<T> = {
  rows: T[];
  baseOrder: RowOrder;
  columns: GridColumn<T>[];
  needle: string;
  order: RowOrder;
  rowsLength: number;
};

// 進行中 run の進捗(0..1)です。チャンクごとに更新します(order は持たないため、進捗 tick では
//   完了結果 state は不変＝下流の order 参照が安定し、本体行は再描画されません)。
type AsyncProgressState<T> = {
  rows: T[];
  baseOrder: RowOrder;
  columns: GridColumn<T>[];
  needle: string;
  progress: number;
};

type UseGlobalFilteredOrderArgs<T> = {
  rows: T[];
  // 恒等 order [0..n-1]。rows.length のみ依存で参照安定(SpreadsheetGrid 側の baseOrder)。
  baseOrder: RowOrder;
  // 走査対象の表示列(visibleColumns)です。
  columns: GridColumn<T>[];
  // 入力欄のライブ値です。フック内部で useDeferredValue により評価値を遅延化します。
  globalText: string;
  // enableGlobalFilter。false のときは常に baseOrder(idle)です。
  enabled: boolean;
};

// 追加(F-async): グローバルテキストフィルタを「通常規模=同期 / 大規模=時間分割の非同期」で
//   適用します。
//   - 同期経路: 旧 globalFilteredOrder useMemo と同じレンダー 1 回きりの計算(チラつき無)。
//   - 非同期経路: yieldToMain で主スレッドを塞がずチャンク走査し、cleanup の cancelled フラグで
//     後続入力 / unmount / 母集合変化に対し安全に中断します。計算中は前回確定 order を表示し続け、
//     完了時に差し替えます(rows.length 変化時のみ baseOrder へ index 安全フォールバック)。
//   結果順は filterOrderByGlobalText と厳密に等価です(チャンク分割は順序不変)。
//   実装注記: 「前回確定 order」は state(完了結果 / 進捗)で持ちます。ref をレンダー中に読むこと
//   (refs-during-render)も、effect 内の同期 setState(set-state-in-effect)も避けるためで、
//   setState はすべて run() 内(await 後 / 完了時)に閉じます。
export const useGlobalFilteredOrder = <T,>({
  rows,
  baseOrder,
  columns,
  globalText,
  enabled,
}: UseGlobalFilteredOrderArgs<T>): GlobalFilteredOrderResult => {
  // 入力欄の即時反映は呼び出し側(slotContext)が担うため、評価値はここで deferred 化します。
  //   連続入力をまず React 側で合体させ、しきい値超で時間分割する二段構えにします。
  const deferredText = useDeferredValue(globalText);
  const normalized = deferredText.trim().toLowerCase();
  const hasFilter = enabled && normalized.length > 0;
  const needsAsync =
    hasFilter && rows.length > ASYNC_GLOBAL_FILTER_ROW_THRESHOLD;

  // 同期で確定できるケース(無効/空/小規模)はここで即時決定します(現状とバイト等価)。
  //   needsAsync のときだけ null を返し、下の effect 経路へ委ねます。
  const syncResult = useMemo<GlobalFilteredOrderResult | null>(() => {
    if (!hasFilter) {
      return { order: baseOrder, status: 'idle', progress: 1 };
    }
    if (!needsAsync) {
      return {
        order: filterOrderByGlobalText(rows, baseOrder, columns, deferredText),
        status: 'ready',
        progress: 1,
      };
    }
    return null;
  }, [hasFilter, needsAsync, rows, baseOrder, columns, deferredText]);

  const [readyState, setReadyState] = useState<AsyncReadyState<T> | null>(null);
  const [progressState, setProgressState] =
    useState<AsyncProgressState<T> | null>(null);

  useEffect(() => {
    // 同期で確定済みなら非同期 run は不要です(進行中 run は直前 cleanup で中断済み)。
    if (!needsAsync) {
      return;
    }

    // この run の入力スナップショット(レンダー側で identity 照合します)。
    const runRows = rows;
    const runBaseOrder = baseOrder;
    const runColumns = columns;
    const runNeedle = normalized;
    const length = runBaseOrder.length;
    // 結果バッファは母集合長で 1 回だけ確保(4byte × N)。チャンクをまたいで詰め続けます。
    const buffer = new Int32Array(length);
    let cancelled = false;

    const run = async (): Promise<void> => {
      let count = 0;
      let pos = 0;
      while (pos < length) {
        const sliceStart = now();
        while (pos < length && now() - sliceStart < CHUNK_BUDGET_MS) {
          const sourceIndex = runBaseOrder[pos];
          if (
            rowMatchesGlobalText(runRows[sourceIndex], runColumns, runNeedle)
          ) {
            buffer[count] = sourceIndex;
            count += 1;
          }
          pos += 1;
        }
        if (pos < length) {
          await yieldToMain();
          // yield 後の中断判定(後続 run / unmount / 母集合変化で cleanup が cancelled を立てる)。
          if (cancelled) {
            return;
          }
          // 進捗のみ通知します(完了結果 state は据え置き＝前回確定 order を表示し続ける)。
          setProgressState({
            rows: runRows,
            baseOrder: runBaseOrder,
            columns: runColumns,
            needle: runNeedle,
            progress: pos / length,
          });
        }
      }
      if (cancelled) {
        return;
      }
      // 全件通過なら baseOrder 参照を温存します(no-op スキップ最大化)。
      const order = count === length ? runBaseOrder : buffer.slice(0, count);
      setReadyState({
        rows: runRows,
        baseOrder: runBaseOrder,
        columns: runColumns,
        needle: runNeedle,
        order,
        rowsLength: runRows.length,
      });
    };
    void run();

    return () => {
      // effect 再実行 / unmount: 進行中 run を次の yield 後に中断させます。
      cancelled = true;
    };
  }, [needsAsync, rows, baseOrder, columns, normalized]);

  // 表示結果を決めます。同期結果 > 現在入力の完了結果 > 前回確定 order(計算中) の優先順です。
  let result: GlobalFilteredOrderResult;
  if (syncResult) {
    result = syncResult;
  } else if (
    // 現在入力に対する非同期結果が完了済み(キー一致)。TS はここで readyState を非 null に絞り込みます。
    readyState !== null &&
    readyState.rows === rows &&
    readyState.baseOrder === baseOrder &&
    readyState.columns === columns &&
    readyState.needle === normalized
  ) {
    result = { order: readyState.order, status: 'ready', progress: 1 };
  } else {
    // 計算中(または stale): 前回完了 order を表示。rows.length 不一致なら index 安全のため baseOrder。
    const fallbackOrder =
      readyState !== null && readyState.rowsLength === rows.length
        ? readyState.order
        : baseOrder;
    // 進捗は現在入力に対する run のものだけ採用(別入力の進捗は 0 扱い)。
    const progress =
      progressState !== null &&
      progressState.rows === rows &&
      progressState.baseOrder === baseOrder &&
      progressState.columns === columns &&
      progressState.needle === normalized
        ? progressState.progress
        : 0;
    result = { order: fallbackOrder, status: 'filtering', progress };
  }

  return result;
};

export default useGlobalFilteredOrder;