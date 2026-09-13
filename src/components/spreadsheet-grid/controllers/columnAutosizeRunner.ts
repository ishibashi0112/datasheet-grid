// 追加(非依存化 ③-9): 列幅の自動調整(autosize)を時間分割で実行するランナーです(React 非依存。
//   旧 hooks/useColumnAutosizeRunner の本体を移設)。
//   - runAutosize(columns): rowModel の全行を runChunked で走査して幅を集計し、完了時に
//     syncColumnWidths を dispatch します。実行中の再実行(世代切替)や rowModel の差し替えで中断します。
//   - isAutosizing(overlay 表示用): 開始から OVERLAY_DELAY_MS 経過しても続いていれば true。
//     レンダー中に読む値なので ValueStore(subscribe / getSnapshot)で公開します。
//   - args は update(毎レンダー)で受けた値を run 開始時にキャプチャし、yield 後は最新 args と比較して
//     rowModel の差し替えを検出します(変更(本体分解 E-6c): 旧 latest-ref 渡しを値渡しへ)。
//   - createAutoSizeOnDataTrigger: prop autoSizeColumns による宣言的トリガー(データ投入時の列幅自動フィット)。
import {
  canMeasureAutosize,
  createColumnWidthAccumulator,
} from '../logic/columnAutosize';
import { runChunked } from '../logic/chunkedLoop';
import { createValueStore } from '../logic/valueStore';
import { gridActions } from '../model/gridActions';
import type { AutoSizeColumnsMode, GridColumn, RowModel } from '../model/gridTypes';
import { resolveAutoSizeOnData } from '../logic/autoSizeOnData';

// 計測が長引く場合にのみ overlay を出す遅延(ms)。短時間で終わる計測でちらつかせないため。
const OVERLAY_DELAY_MS = 180;

type ReadonlyRef<V> = { readonly current: V };

export type ColumnAutosizeRunnerArgs<T> = {
  rowModel: RowModel<T>;
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  // 現在の解決済み列幅(flex 解決済み)。
  columnWidths: Record<string, number>;
  dispatch: (action: ReturnType<typeof gridActions.syncColumnWidths>) => void;
};

export type ColumnAutosizeRunner<T> = {
  update: (args: ColumnAutosizeRunnerArgs<T>) => void;
  runAutosize: (columns: GridColumn<T>[]) => Promise<void>;
  // isAutosizing の購読(useSyncExternalStore 互換)。
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  // 進行中の run を無効化し overlay タイマーを止めます(アンマウント時)。
  dispose: () => void;
};

export const createColumnAutosizeRunner = <T,>(): ColumnAutosizeRunner<T> => {
  let args: ColumnAutosizeRunnerArgs<T> | null = null;
  const isAutosizing = createValueStore(false);
  let runGeneration = 0;
  let overlayTimer: ReturnType<typeof setTimeout> | null = null;

  const clearOverlayTimer = () => {
    if (overlayTimer !== null) {
      clearTimeout(overlayTimer);
      overlayTimer = null;
    }
  };

  const update = (next: ColumnAutosizeRunnerArgs<T>) => {
    args = next;
  };

  const runAutosize = async (columns: GridColumn<T>[]): Promise<void> => {
    if (args === null || columns.length === 0 || !canMeasureAutosize()) {
      return;
    }
    const { rowModel, gridRootRef, columnWidths: currentWidths, dispatch } = args;
    const myGeneration = (runGeneration += 1);
    clearOverlayTimer();

    const viewRowCount = rowModel.getRowCount();
    const gridRoot = gridRootRef.current;
    const accumulator = createColumnWidthAccumulator(columns);

    overlayTimer = setTimeout(() => {
      if (runGeneration === myGeneration) {
        isAutosizing.setSnapshot(true);
      }
    }, OVERLAY_DELAY_MS);

    try {
      const completed = await runChunked(
        viewRowCount,
        (viewIndex) => {
          const row = rowModel.getRow(viewIndex);
          if (row) {
            accumulator.collect(row);
          }
        },
        {
          // 世代が進んだ(再実行 / dispose)か rowModel が差し替わったら中断。
          isCancelled: () =>
            runGeneration !== myGeneration || args?.rowModel !== rowModel,
        },
      );
      if (!completed) {
        return;
      }
      const nextWidths = accumulator.finalize({ gridRoot, currentWidths });
      if (Object.keys(nextWidths).length > 0) {
        dispatch(gridActions.syncColumnWidths(nextWidths));
      }
    } finally {
      if (runGeneration === myGeneration) {
        clearOverlayTimer();
        isAutosizing.setSnapshot(false);
      }
    }
  };

  return {
    update,
    runAutosize,
    subscribe: isAutosizing.subscribe,
    getSnapshot: isAutosizing.getSnapshot,
    dispose: () => {
      runGeneration += 1;
      clearOverlayTimer();
    },
  };
};

// ── autoSize on data(データ投入時の列幅自動フィット)────────────
// 追加(本体分解 E-6c): prop autoSizeColumns による宣言的トリガーです(旧 SpreadsheetGrid.tsx の effect を移設)。
//   列メニュー「すべての列の幅を自動調整」と同一エンジン(runAutosize)を、rows(データ)の変化を signal に発火させる
//   だけの薄い配線です。
//   - 'onMount'      : 初回にデータが載った一度きり(hasAutoSizedOnMount で二度目以降を抑止)。
//   - 'onDataChange' : rows(参照)が変わるたび(= データ差し替えのたび)。手動リサイズは上書きされます。
//   - false(既定)   : 何もしません。
//   発火 signal は旧 effect の deps(mode / rows / isServerSide / runAutosize)のみ。列の並べ替え / 表示切替 / 固定
//   (= visibleColumns 変化)では再フィットしません(visibleColumns は最新値を読むだけ)。update は passive
//   (ペイント後)で呼ぶこと(rows 変化ぶんのパイプライン再計算済み・gridRoot mount 済みで計測する)。
export type AutoSizeOnDataArgs<T> = {
  mode: AutoSizeColumnsMode;
  isServerSide: boolean;
  rows: T[];
  visibleColumns: GridColumn<T>[];
  runAutosize: (columns: GridColumn<T>[]) => Promise<void>;
};

export type AutoSizeOnDataTrigger<T> = {
  update: (args: AutoSizeOnDataArgs<T>) => void;
};

export const createAutoSizeOnDataTrigger = <T,>(): AutoSizeOnDataTrigger<T> => {
  let last: AutoSizeOnDataArgs<T> | null = null;
  let hasAutoSizedOnMount = false;
  return {
    update: (next) => {
      if (
        last !== null &&
        last.mode === next.mode &&
        last.isServerSide === next.isServerSide &&
        last.rows === next.rows &&
        last.runAutosize === next.runAutosize
      ) {
        last = next;
        return;
      }
      last = next;
      const { shouldRun, nextHasAutoSizedOnMount } = resolveAutoSizeOnData({
        mode: next.mode,
        isServerSide: next.isServerSide,
        rowCount: next.rows.length,
        hasAutoSizedOnMount,
      });
      hasAutoSizedOnMount = nextHasAutoSizedOnMount;
      if (shouldRun) {
        void next.runAutosize(next.visibleColumns);
      }
    },
  };
};