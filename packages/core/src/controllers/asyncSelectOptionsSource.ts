// 追加(async-options): set / select / 複合列の候補を利用側コールバック(getFilterOptions)から取得する
//   コントローラです(React 非依存。{ update, retry, subscribe, getSnapshot, dispose })。
//   - update(args) は毎レンダー渡される最新値を保持し、「開いている列(columnKey)」が変わったときだけ
//     取得を開始 / 中断します(open = null → key、列切替 = key → 別 key、close = key → null)。
//     引数(他列フィルター / globalText)は開始時点のスナップショットで固定します(取得中に変わっても
//     再取得しない = 開くたびに取得、キャッシュなし)。
//   - retry() は同じ列で取り直します(失敗時の「再試行」)。
//   - 応答は要求トークンで識別し、中断済み / 古い要求の解決・拒否は捨てます(abort による reject は
//     エラー表示にしない)。
import type { ColumnFilterValue, GetFilterOptionsResult, GridColumn } from '../model/gridTypes.unbound';
import { createValueStore } from '../logic/valueStore';
import type { SelectOptionEntry } from '../logic/selectOptions';
import { IDLE_SELECT_OPTIONS_RESULT, type ColumnSelectOptionsResult } from './selectOptionsCollector';

// getFilterOptions の引数(gridTypes.core の GetFilterOptionsParams を内部束縛で受けた形)。
export type AsyncSelectOptionsFetchParams<T> = {
  columnKey: string;
  column: GridColumn<T>;
  columnFilters: Record<string, ColumnFilterValue>;
  globalText: string;
  signal: AbortSignal;
};

export type AsyncSelectOptionsFetch<T> = (params: AsyncSelectOptionsFetchParams<T>) => Promise<GetFilterOptionsResult>;

export type AsyncSelectOptionsSourceArgs<T> = {
  // 非同期供給の対象として開いている列(null = 閉じている / 対象外の列)。
  columnKey: string | null;
  column: GridColumn<T> | null;
  // 全列の有効フィルター(開始時に開いている列を除いてスナップショットする)。
  columnFilters: Record<string, ColumnFilterValue>;
  globalText: string;
  fetch: AsyncSelectOptionsFetch<T> | null;
};

export type AsyncSelectOptionsSnapshot = {
  // どの列の結果か(アダプタは現在の columnKey と一致するときだけ表面化する)。
  columnKey: string | null;
  result: ColumnSelectOptionsResult;
};

export type AsyncSelectOptionsSource<T> = {
  update: (args: AsyncSelectOptionsSourceArgs<T>) => void;
  retry: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AsyncSelectOptionsSnapshot;
  dispose: () => void;
};

const EMPTY_OPTIONS: SelectOptionEntry[] = [];
const EMPTY_VALUES: ReadonlySet<string> = new Set();

export const LOADING_SELECT_OPTIONS_RESULT: ColumnSelectOptionsResult = {
  status: 'loading',
  options: EMPTY_OPTIONS,
  allValues: EMPTY_VALUES,
  progress: 0,
};

const IDLE_SNAPSHOT: AsyncSelectOptionsSnapshot = { columnKey: null, result: IDLE_SELECT_OPTIONS_RESULT };

// 開いている列を除いた他列フィルター(Excel 方式の材料)。
export const omitOwnColumnFilter = (
  columnFilters: Record<string, ColumnFilterValue>,
  columnKey: string,
): Record<string, ColumnFilterValue> => {
  if (!(columnKey in columnFilters)) {
    return columnFilters;
  }
  const next: Record<string, ColumnFilterValue> = {};
  for (const key of Object.keys(columnFilters)) {
    if (key !== columnKey) {
      next[key] = columnFilters[key];
    }
  }
  return next;
};

const toErrorMessage = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.message || reason.name;
  }
  return typeof reason === 'string' ? reason : String(reason);
};

// 現在の列に一致するスナップショットだけを表面化します(不一致 = 開始前 / 別列の結果 → 読み込み中扱い)。
export const selectAsyncOptionsResult = (
  snapshot: AsyncSelectOptionsSnapshot,
  columnKey: string | null,
): ColumnSelectOptionsResult =>
  columnKey === null
    ? IDLE_SELECT_OPTIONS_RESULT
    : snapshot.columnKey === columnKey
      ? snapshot.result
      : LOADING_SELECT_OPTIONS_RESULT;

export const createAsyncSelectOptionsSource = <T,>(): AsyncSelectOptionsSource<T> => {
  const store = createValueStore<AsyncSelectOptionsSnapshot>(IDLE_SNAPSHOT);
  let current: AsyncSelectOptionsSourceArgs<T> | null = null;
  let controller: AbortController | null = null;
  let requestToken = 0;

  const abortCurrent = () => {
    controller?.abort();
    controller = null;
  };

  const start = (args: AsyncSelectOptionsSourceArgs<T>) => {
    const { columnKey, column, fetch } = args;
    if (columnKey === null || column === null || fetch === null) {
      return;
    }
    abortCurrent();
    const token = ++requestToken;
    const abort = new AbortController();
    controller = abort;
    store.setSnapshot({ columnKey, result: LOADING_SELECT_OPTIONS_RESULT });
    let promise: Promise<GetFilterOptionsResult>;
    try {
      promise = Promise.resolve(
        fetch({
          columnKey,
          column,
          columnFilters: omitOwnColumnFilter(args.columnFilters, columnKey),
          globalText: args.globalText,
          signal: abort.signal,
        }),
      );
    } catch (reason) {
      // 同期例外も失敗として扱います(reject と同じ経路)。
      promise = Promise.reject(reason);
    }
    promise.then(
      (result) => {
        if (token !== requestToken || abort.signal.aborted) {
          return;
        }
        controller = null;
        const options = Array.isArray(result?.options) ? result.options : EMPTY_OPTIONS;
        store.setSnapshot({
          columnKey,
          result: {
            status: 'ready',
            options,
            allValues: new Set(options.map((option) => option.value)),
            progress: 1,
            truncated: result?.truncated === true,
          },
        });
      },
      (reason: unknown) => {
        if (token !== requestToken || abort.signal.aborted) {
          return;
        }
        controller = null;
        store.setSnapshot({
          columnKey,
          result: {
            status: 'error',
            options: EMPTY_OPTIONS,
            allValues: EMPTY_VALUES,
            progress: 0,
            errorMessage: toErrorMessage(reason),
          },
        });
      },
    );
  };

  const update = (args: AsyncSelectOptionsSourceArgs<T>) => {
    const prev = current;
    current = args;
    // fetch の参照は比較しない(毎レンダーのインライン関数で再取得しないため)。有無だけを見る。
    const keyChanged =
      prev === null || prev.columnKey !== args.columnKey || (prev.fetch === null) !== (args.fetch === null);
    if (!keyChanged) {
      return;
    }
    if (args.columnKey === null || args.fetch === null) {
      // 閉じた / 対象外: in-flight を中断し idle へ。
      abortCurrent();
      requestToken += 1;
      if (store.getSnapshot() !== IDLE_SNAPSHOT) {
        store.setSnapshot(IDLE_SNAPSHOT);
      }
      return;
    }
    start(args);
  };

  const retry = () => {
    if (current) {
      start(current);
    }
  };

  return {
    update,
    retry,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    dispose: () => {
      abortCurrent();
      requestToken += 1;
      current = null;
    },
  };
};