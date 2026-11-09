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

// 変更(async-options): 'loading'(利用側コールバックからの取得中。進捗なし)/ 'error'(取得失敗)を追加。
//   'collecting' は従来どおり rows からの時間分割収集(進捗あり)。
export type ColumnSelectOptionsStatus = 'idle' | 'collecting' | 'loading' | 'ready' | 'error';

export type ColumnSelectOptionsResult = {
  status: ColumnSelectOptionsStatus;
  options: SelectOptionEntry[];
  allValues: ReadonlySet<string>;
  progress: number;
  // 追加(async-options): 候補が件数上限で打ち切られた(getFilterOptions の truncated)。
  truncated?: boolean;
  // 追加(async-options): status === 'error' のときの表示用メッセージ(Error.message か String(reason))。
  errorMessage?: string;
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

// 追加(async-options): 解決済み UI 種別が候補(Set / select)を使うかです(シェルが非同期供給の要否判定に使う)。
export const isSelectLikeFilterType = (filterType: string | null | undefined): boolean =>
  filterType === 'select' ||
  filterType === 'set' ||
  filterType === 'numberSet' ||
  filterType === 'textSet' ||
  filterType === 'dateSet';

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
// 変更(1.0.1 / AP-18): numeric = 数の列(解決済みの種別が numberSet)の候補を数の順に並べる。
export const resolveSyncSelectOptions = <T,>(
  column: GridColumn<T> | null,
  rowCount: number,
  getRawValueAt: RawValueAccessor,
  numeric = false,
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
    const options = collectSelectOptions(rowCount, getRawValueAt, numeric);
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
  // 追加(1.0.1 / AP-18): 数の列の候補を数の順に並べる。
  numeric?: boolean;
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-19): どの列の候補か(列のキーなど)。同じ列のまま行だけが変わった
  //   (rows がよく変わる表)ときは、走っている収集を最後まで走らせて結果を出し、終わってから今の行で集め直します。
  //   集め直している間も前の候補を出したままにします。これまでは行が変わるたびに最初から集め直し、100 万行の表では
  //   候補が出たり消えたりし、dateSet は条件欄も出なかった。
  sourceKey?: string;
};

export type SelectOptionsCollectSnapshot = {
  source: RawValueAccessor | null;
  rowCount: number;
  sourceKey?: string;
  result: ColumnSelectOptionsResult;
};

const IDLE_SNAPSHOT: SelectOptionsCollectSnapshot = {
  source: null,
  rowCount: 0,
  result: IDLE_SELECT_OPTIONS_RESULT,
};

// 現在のキーに一致するスナップショットだけを表面化します(不一致 = 収集開始前 / 別列の結果)。
//   変更(1.0.1 / AP-19): 同じ列(sourceKey)の集め終えた候補は、行が変わった後も出します(集め直しが終わるまで)。
export const selectCollectorResult = (
  snapshot: SelectOptionsCollectSnapshot,
  rowCount: number,
  getRawValueAt: RawValueAccessor,
  sourceKey?: string,
): ColumnSelectOptionsResult => {
  if (snapshot.source === getRawValueAt && snapshot.rowCount === rowCount) {
    return snapshot.result;
  }
  if (sourceKey !== undefined && snapshot.sourceKey === sourceKey && snapshot.result.status === 'ready') {
    return snapshot.result;
  }
  return COLLECTING_INITIAL;
};

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

  // 走っている収集の args(同じ列で行だけ変わったときに、止めずに最後まで走らせるのに使う)。
  let running: SelectOptionsCollectorArgs | null = null;

  const start = (args: SelectOptionsCollectorArgs) => {
    const { getRawValueAt, rowCount, sourceKey } = args;
    const accumulator = createSelectOptionsAccumulator(args.numeric === true);
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    cancelCurrent = cancel;
    running = args;
    void runChunked(rowCount, (index) => accumulator.collect(getRawValueAt(index)), {
      isCancelled: () => cancelled,
      onYield: (done, total) => {
        const shown = store.getSnapshot();
        if (sourceKey !== undefined && shown.sourceKey === sourceKey && shown.result.status === 'ready') {
          // 同じ列の前の候補を出している間は、集め直しの進み具合を出さない(候補を消さない)。
          return;
        }
        store.setSnapshot({
          source: getRawValueAt,
          rowCount,
          sourceKey,
          result: {
            status: 'collecting',
            options: EMPTY_OPTIONS,
            allValues: EMPTY_VALUES,
            progress: done / total,
          },
        });
      },
    }).then((completed) => {
      // 追加(audit C-11): 走り切った run は「走っている run」から外します(dispose で current を忘れる判定に使う)。
      if (cancelCurrent === cancel) {
        cancelCurrent = null;
        running = null;
      }
      if (!completed) {
        return;
      }
      const options = accumulator.finalize();
      store.setSnapshot({
        source: getRawValueAt,
        rowCount,
        sourceKey,
        result: {
          status: 'ready',
          options,
          allValues: buildValueSet(options),
          progress: 1,
        },
      });
      // 走っている間に行が変わっていたら、今の行で集め直します(前の候補は出したまま)。
      if (current !== null && current !== args && current.needsAsync && isDifferentSource(current, args)) {
        start(current);
      }
    });
  };

  const isDifferentSource = (a: SelectOptionsCollectorArgs, b: SelectOptionsCollectorArgs): boolean =>
    a.rowCount !== b.rowCount || a.getRawValueAt !== b.getRawValueAt || a.numeric !== b.numeric;

  const update = (args: SelectOptionsCollectorArgs) => {
    const keyChanged =
      current === null ||
      current.needsAsync !== args.needsAsync ||
      current.rowCount !== args.rowCount ||
      current.getRawValueAt !== args.getRawValueAt ||
      current.numeric !== args.numeric;
    current = args;
    if (!keyChanged) {
      return;
    }
    // 変更(1.0.1 / AP-19): 同じ列のまま行だけが変わったときは、走っている収集を止めない(終わったら集め直す)。
    if (
      args.needsAsync &&
      running !== null &&
      cancelCurrent !== null &&
      args.sourceKey !== undefined &&
      running.sourceKey === args.sourceKey &&
      running.numeric === args.numeric
    ) {
      return;
    }
    // キーが変わった: 旧 effect の cleanup に相当(in-flight を中断)。必要なら新しい run を開始。
    cancelCurrent?.();
    cancelCurrent = null;
    running = null;
    if (args.needsAsync) {
      start(args);
    }
  };

  return {
    update,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    // 修正(audit C-11): 走っている run を中断したときは前回の args も忘れます。StrictMode の擬似アンマウント →
    //   再マウントで同じ args の update が来たとき、keyChanged=false で再開されず進捗が固着するのを防ぎます。
    //   走り切った後の dispose では args を保持します(同じ args で計算し直さない)。
    dispose: () => {
      if (cancelCurrent !== null) {
        cancelCurrent();
        cancelCurrent = null;
        running = null;
        current = null;
      }
    },
  };
};