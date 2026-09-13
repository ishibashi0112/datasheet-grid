// 追加(非依存化 ③-9): 列幅の自動調整(autosize)を時間分割で実行するランナーです(React 非依存。
//   旧 hooks/useColumnAutosizeRunner の本体を移設)。
//   - runAutosize(columns): rowModel の全行を runChunked で走査して幅を集計し、完了時に
//     syncColumnWidths を dispatch します。実行中の再実行(世代切替)や rowModel の差し替えで中断します。
//   - isAutosizing(overlay 表示用): 開始から OVERLAY_DELAY_MS 経過しても続いていれば true。
//     レンダー中に読む値なので ValueStore(subscribe / getSnapshot)で公開します。
//   - args は latest-ref({ readonly current })で受けます。旧実装と同じく run 開始時 / yield 後に
//     最新値を読むためで、React アダプタは本体が持つ ref をそのまま渡します。
import {
  canMeasureAutosize,
  createColumnWidthAccumulator,
} from '../logic/columnAutosize';
import { runChunked } from '../logic/chunkedLoop';
import { createValueStore } from '../logic/valueStore';
import { gridActions } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes';

// 計測が長引く場合にのみ overlay を出す遅延(ms)。短時間で終わる計測でちらつかせないため。
const OVERLAY_DELAY_MS = 180;

type ReadonlyRef<V> = { readonly current: V };

export type ColumnAutosizeRunnerArgs<T> = {
  rowModelRef: ReadonlyRef<RowModel<T>>;
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  columnWidthsRef: ReadonlyRef<Record<string, number>>;
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
    const { rowModelRef, gridRootRef, columnWidthsRef, dispatch } = args;
    const myGeneration = (runGeneration += 1);
    clearOverlayTimer();

    const rowModel = rowModelRef.current;
    const viewRowCount = rowModel.getRowCount();
    const gridRoot = gridRootRef.current;
    const currentWidths = columnWidthsRef.current;
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
            runGeneration !== myGeneration || rowModelRef.current !== rowModel,
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