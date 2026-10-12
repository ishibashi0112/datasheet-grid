// 追加(選択範囲の集計): 選択範囲の集計を求めるランナーです(React 非依存。globalFilteredOrder と同じ形)。
//   - 小さな選択(走査セル数が SYNC_SELECTION_AGGREGATE_CELL_LIMIT 以下)は純関数 resolveSyncSelectionAggregates で、
//     アダプタがレンダー中に(memo して)計算します。
//   - 大きな選択(全選択の 100 万行など)はランナーが runChunked で行単位に時間分割し、進捗 / 完了を ValueStore で
//     公開します。update(args) で選択(target)が変わったら走っている計算を中断し、必要なら最初からやり直します。
//     変更(見直し): 行(rowModel)だけが変わったとき(編集 / ライブ更新 / SSRM の行の到着)は、走っている計算を
//     打ち切らずに終えて結果を出し、終わってから最新の行で計算し直します(行が計算より速く変わり続けても結果が出る)。
//     そのあいだは前の結果を出し続けます(同じ選択の結果があれば「集計中」にしない)。
//   - 進捗は 5% 刻みでだけ公開します(チャンクごとにシェル全体を再描画しない)。
//   - 結果の合成(同期 → 完了 → 同じ選択の前の結果 → 計算中)は純関数 selectSelectionAggregatesResult。
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
// 進捗の公開の刻み(1 / PROGRESS_STEPS = 5%)。
const PROGRESS_STEPS = 20;

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
  // 同じ選択で行だけ変わったあいだは、前の結果を出し続けます(計算し直しが終われば差し替わる)。
  if (key.target !== null && snapshot.ready !== null && snapshot.ready.target === key.target) {
    return snapshot.ready.result;
  }
  const progress =
    snapshot.progress !== null && snapshot.progress.target === key.target ? snapshot.progress.progress : 0;
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
  // 走っている計算(キーと中断)。
  let running: { key: SelectionAggregatesKey<T>; cancel: () => void } | null = null;

  const start = (key: SelectionAggregatesKey<T>, target: SelectionAggregateTarget<T>) => {
    const accumulator = createSelectionAggregateAccumulator();
    const rowCount = target.endRow - target.startRow + 1;
    let cancelled = false;
    let publishedStep = -1;
    const run = {
      key,
      cancel: () => {
        cancelled = true;
      },
    };
    running = run;
    void runChunked(
      rowCount,
      (offset) => {
        accumulateSelectionAggregateRow(accumulator, key.rowModel, target.startRow + offset, target.columns);
      },
      {
        isCancelled: () => cancelled,
        onYield: (done, total) => {
          const step = Math.floor((done / total) * PROGRESS_STEPS);
          if (step === publishedStep) {
            return;
          }
          publishedStep = step;
          store.setSnapshot({ ...store.getSnapshot(), progress: { ...key, progress: step / PROGRESS_STEPS } });
        },
      },
    ).then((completed) => {
      if (running === run) {
        running = null;
      }
      if (!completed) {
        return;
      }
      store.setSnapshot({
        ...store.getSnapshot(),
        ready: { ...key, result: finalizeSelectionAggregates(accumulator) },
      });
      // 計算中に行だけ変わっていたら、最新の行でもう一度計算します。
      const latest = current;
      if (
        running === null &&
        latest !== null &&
        latest.needsAsync &&
        latest.target === key.target &&
        latest.rowModel !== key.rowModel
      ) {
        start({ rowModel: latest.rowModel, target: key.target! }, target);
      }
    });
  };

  const update = (args: SelectionAggregatesArgs<T>) => {
    const previous = current;
    current = args;
    if (previous !== null && previous.needsAsync === args.needsAsync && sameKey(previous, args)) {
      return;
    }
    // 行だけが変わった: 走っている同じ選択の計算は終えてから、最新の行でやり直します(完了時に start)。
    if (
      previous !== null &&
      previous.needsAsync === args.needsAsync &&
      args.needsAsync &&
      running !== null &&
      running.key.target === args.target
    ) {
      return;
    }
    running?.cancel();
    running = null;
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
      if (running !== null) {
        running.cancel();
        running = null;
        current = null;
      }
    },
  };
};