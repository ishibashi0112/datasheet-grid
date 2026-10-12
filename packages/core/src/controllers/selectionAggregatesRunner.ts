// 追加(選択範囲の集計): 選択範囲の集計を求めるランナーです(React 非依存。globalFilteredOrder と同じ形)。
//   - 小さな選択(走査セル数が SYNC_SELECTION_AGGREGATE_CELL_LIMIT 以下)は純関数 resolveSyncSelectionAggregates で、
//     アダプタがレンダー中に(memo して)計算します。
//   - 大きな選択(全選択の 100 万行など)はランナーが runChunked で行単位に時間分割し、進捗 / 完了を ValueStore で
//     公開します。update(args) でキー(rowModel / target)が変わったら走っている計算を中断し、必要なら最初から
//     やり直します(編集で rowModel が変われば再計算、SSRM の行の到着も rowModel の参照が変わるので再計算)。
//   - 結果の合成(同期 → 完了 → 計算中)は純関数 selectSelectionAggregatesResult。
import type { GridSelectionAggregates, RowModel } from '../model/gridTypes.unbound';
import { runChunked } from '../logic/chunkedLoop';
import { createValueStore } from '../logic/valueStore';
import {
  accumulateSelectionAggregateRow,
  computeSelectionAggregates,
  createComputingSelectionAggregates,
  createSelectionAggregateAccumulator,
  estimateSelectionAggregateCells,
  finalizeSelectionAggregates,
  type SelectionAggregateTarget,
} from '../logic/selectionAggregates';

// これ以下のセル数は同期で一括計算します。
export const SYNC_SELECTION_AGGREGATE_CELL_LIMIT = 50_000;

export type SelectionAggregatesKey<T> = {
  rowModel: RowModel<T>;
  // null = 集計しない(2 セル未満 / 無効)。
  target: SelectionAggregateTarget<T> | null;
};

// 同期経路の解決。undefined = 時間分割が必要(target があり、セル数が上限超)。
export const resolveSyncSelectionAggregates = <T,>(
  key: SelectionAggregatesKey<T>,
): GridSelectionAggregates | null | undefined => {
  if (key.target === null) {
    return null;
  }
  if (estimateSelectionAggregateCells(key.target) <= SYNC_SELECTION_AGGREGATE_CELL_LIMIT) {
    return computeSelectionAggregates(key.rowModel, key.target);
  }
  return undefined;
};

export type SelectionAggregatesArgs<T> = SelectionAggregatesKey<T> & {
  needsAsync: boolean;
};

export type SelectionAggregatesSnapshot<T> = {
  ready: (SelectionAggregatesKey<T> & { result: GridSelectionAggregates }) | null;
  progress: (SelectionAggregatesKey<T> & { progress: number }) | null;
};

const sameKey = <T,>(a: SelectionAggregatesKey<T>, b: SelectionAggregatesKey<T>): boolean =>
  a.rowModel === b.rowModel && a.target === b.target;

export const selectSelectionAggregatesResult = <T,>(
  syncResult: GridSelectionAggregates | null | undefined,
  snapshot: SelectionAggregatesSnapshot<T>,
  key: SelectionAggregatesKey<T>,
): GridSelectionAggregates | null => {
  if (syncResult !== undefined) {
    return syncResult;
  }
  if (snapshot.ready !== null && sameKey(snapshot.ready, key)) {
    return snapshot.ready.result;
  }
  const progress =
    snapshot.progress !== null && sameKey(snapshot.progress, key) ? snapshot.progress.progress : 0;
  return createComputingSelectionAggregates(progress);
};

export type SelectionAggregatesRunner<T> = {
  update: (args: SelectionAggregatesArgs<T>) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SelectionAggregatesSnapshot<T>;
  dispose: () => void;
};

export const createSelectionAggregatesRunner = <T,>(): SelectionAggregatesRunner<T> => {
  const store = createValueStore<SelectionAggregatesSnapshot<T>>({ ready: null, progress: null });
  let current: SelectionAggregatesArgs<T> | null = null;
  let cancelCurrent: (() => void) | null = null;

  const start = (key: SelectionAggregatesKey<T>, target: SelectionAggregateTarget<T>) => {
    const accumulator = createSelectionAggregateAccumulator();
    const rowCount = target.endRow - target.startRow + 1;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    cancelCurrent = cancel;
    void runChunked(
      rowCount,
      (offset) => {
        accumulateSelectionAggregateRow(accumulator, key.rowModel, target.startRow + offset, target.columns);
      },
      {
        isCancelled: () => cancelled,
        onYield: (done, total) => {
          store.setSnapshot({ ...store.getSnapshot(), progress: { ...key, progress: done / total } });
        },
      },
    ).then((completed) => {
      if (cancelCurrent === cancel) {
        cancelCurrent = null;
      }
      if (!completed) {
        return;
      }
      store.setSnapshot({
        ...store.getSnapshot(),
        ready: { ...key, result: finalizeSelectionAggregates(accumulator) },
      });
    });
  };

  const update = (args: SelectionAggregatesArgs<T>) => {
    const keyChanged = current === null || current.needsAsync !== args.needsAsync || !sameKey(current, args);
    current = args;
    if (!keyChanged) {
      return;
    }
    cancelCurrent?.();
    cancelCurrent = null;
    if (args.needsAsync && args.target !== null) {
      start({ rowModel: args.rowModel, target: args.target }, args.target);
    }
  };

  return {
    update,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    // 走っている計算を中断したときは前回の args も忘れます(StrictMode の再マウントで同じ args の update が来たとき
    //   再開させるため。globalFilteredOrder の audit C-11 と同じ)。
    dispose: () => {
      if (cancelCurrent !== null) {
        cancelCurrent();
        cancelCurrent = null;
        current = null;
      }
    },
  };
};