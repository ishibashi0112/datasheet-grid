// 追加(非依存化 ③-10): select / set 系フィルターの候補収集ランナーです(React 非依存。
//   旧 hooks/useColumnSelectOptionsCollector の本体を移設)。
//   - 同期経路(閾値以下 / filterOptions 明示 / 非対象列)は純関数 resolveSyncSelectOptions で、
//     アダプタがレンダー中に(memo して)計算します。
//   - 非同期経路(閾値超)はコントローラが runChunked で時間分割収集し、進捗 / 完了を ValueStore で
//     公開します。update(args) でキー(getRawValueAt / rowCount / needsAsync)が変わったら in-flight の
//     run を中断し、必要なら再開します(旧 effect の deps と cleanup に相当)。
//   - スナップショットは「どのキーで得た結果か」を持ち、アダプタは現在のキーと一致するときだけ表面化
//     します(列切替直後に前列の候補を見せない = stale 排除)。
import type { GridColumn } from '../model/gridTypes.unbound';
import { runChunked } from '../logic/chunkedLoop';
import { createValueStore } from '../logic/valueStore';
import {
  collectSelectOptions,
  createSelectOptionsAccumulator,
  type SelectOptionEntry,
} from '../logic/selectOptions';

// これ以下の行数は同期一括で収集します(従来どおり open レンダーの memo で即 ready)。
export const ASYNC_SELECT_COLLECT_ROW_THRESHOLD = 50_000;

const EMPTY_OPTIONS: SelectOptionEntry[] = [];
const EMPTY_VALUES: ReadonlySet<string> = new Set<string>();

export type ColumnSelectOptionsStatus = 'idle' | 'collecting' | 'ready';

export type ColumnSelectOptionsResult = {
  status: ColumnSelectOptionsStatus;
  options: SelectOptionEntry[];
  allValues: ReadonlySet<string>;
  progress: number;
};

export const IDLE_SELECT_OPTIONS_RESULT: ColumnSelectOptionsResult = {
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

export type RawValueAccessor = (index: number) => unknown;

const buildValueSet = (options: SelectOptionEntry[]): ReadonlySet<string> =>
  new Set(options.map((option) => option.value));

const isSelectLikeColumn = <T,>(column: GridColumn<T> | null): boolean => {
  const filterType = column?.filterType ?? null;
  return (
    filterType === 'select' ||
    filterType === 'set' ||
    filterType === 'numberSet' ||
    filterType === 'textSet' ||
    filterType === 'dateSet'
  );
};

// 同期経路の解決。null = 非同期収集が必要(閾値超で候補未指定)。
export const resolveSyncSelectOptions = <T,>(
  column: GridColumn<T> | null,
  rowCount: number,
  getRawValueAt: RawValueAccessor,
): ColumnSelectOptionsResult | null => {
  if (!column || !isSelectLikeColumn(column)) {
    return IDLE_SELECT_OPTIONS_RESULT;
  }
  const explicitOptions =
    column.filterOptions && column.filterOptions.length > 0
      ? (column.filterOptions as SelectOptionEntry[])
      : null;
  if (explicitOptions) {
    return {
      status: 'ready',
      options: explicitOptions,
      allValues: buildValueSet(explicitOptions),
      progress: 1,
    };
  }
  if (rowCount <= ASYNC_SELECT_COLLECT_ROW_THRESHOLD) {
    const options = collectSelectOptions(rowCount, getRawValueAt);
    return {
      status: 'ready',
      options,
      allValues: buildValueSet(options),
      progress: 1,
    };
  }
  return null;
};

export type SelectOptionsCollectorArgs = {
  // resolveSyncSelectOptions が null(= 非同期が必要)か。
  needsAsync: boolean;
  rowCount: number;
  getRawValueAt: RawValueAccessor;
};

export type SelectOptionsCollectSnapshot = {
  source: RawValueAccessor | null;
  rowCount: number;
  result: ColumnSelectOptionsResult;
};

const IDLE_SNAPSHOT: SelectOptionsCollectSnapshot = {
  source: null,
  rowCount: 0,
  result: IDLE_SELECT_OPTIONS_RESULT,
};

// 現在のキーに一致するスナップショットだけを表面化します(不一致 = 収集開始前 / 別列の結果)。
export const selectCollectorResult = (
  snapshot: SelectOptionsCollectSnapshot,
  rowCount: number,
  getRawValueAt: RawValueAccessor,
): ColumnSelectOptionsResult =>
  snapshot.source === getRawValueAt && snapshot.rowCount === rowCount
    ? snapshot.result
    : COLLECTING_INITIAL;

export type SelectOptionsCollector = {
  update: (args: SelectOptionsCollectorArgs) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SelectOptionsCollectSnapshot;
  dispose: () => void;
};

export const createSelectOptionsCollector = (): SelectOptionsCollector => {
  const store = createValueStore<SelectOptionsCollectSnapshot>(IDLE_SNAPSHOT);
  let current: SelectOptionsCollectorArgs | null = null;
  let cancelCurrent: (() => void) | null = null;

  const start = (args: SelectOptionsCollectorArgs) => {
    const { getRawValueAt, rowCount } = args;
    const accumulator = createSelectOptionsAccumulator();
    let cancelled = false;
    cancelCurrent = () => {
      cancelled = true;
    };
    void runChunked(rowCount, (index) => accumulator.collect(getRawValueAt(index)), {
      isCancelled: () => cancelled,
      onYield: (done, total) => {
        store.setSnapshot({
          source: getRawValueAt,
          rowCount,
          result: {
            status: 'collecting',
            options: EMPTY_OPTIONS,
            allValues: EMPTY_VALUES,
            progress: done / total,
          },
        });
      },
    }).then((completed) => {
      if (!completed) {
        return;
      }
      const options = accumulator.finalize();
      store.setSnapshot({
        source: getRawValueAt,
        rowCount,
        result: {
          status: 'ready',
          options,
          allValues: buildValueSet(options),
          progress: 1,
        },
      });
    });
  };

  const update = (args: SelectOptionsCollectorArgs) => {
    const keyChanged =
      current === null ||
      current.needsAsync !== args.needsAsync ||
      current.rowCount !== args.rowCount ||
      current.getRawValueAt !== args.getRawValueAt;
    current = args;
    if (!keyChanged) {
      return;
    }
    // キーが変わった: 旧 effect の cleanup に相当(in-flight を中断)。必要なら新しい run を開始。
    cancelCurrent?.();
    cancelCurrent = null;
    if (args.needsAsync) {
      start(args);
    }
  };

  return {
    update,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    dispose: () => {
      cancelCurrent?.();
      cancelCurrent = null;
    },
  };
};