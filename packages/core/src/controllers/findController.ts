// 追加(F-2 / セル内検索): 検索バーの状態(開閉 / クエリ / ヒット / カレント)と走査を持つコントローラです(React 非依存)。
//   - 走査は logic/chunkedLoop の時間分割(1 チャンク 10ms)で行い、入力・描画を止めません。再走査の要因は
//     クエリ / 大文字小文字 / rowModel(行の差し替え・ソート・フィルター)/ 列の変化。走査中に要因が変わったら
//     世代(generation)で古い結果を捨てます。
//   - 結果はスナップショット(ValueStore)で公開し、React は useSyncExternalStore で購読、描画側は index(rowIndex →
//     colIndex → 範囲)で O(1) にセルのヒットを引きます。
//   - 順送り(next / prev)とクエリ確定時はカレントのヒットへ onNavigate(rowIndex, colIndex)(シェルが selectCell +
//     スクロール)。ヒット数は MAX_MATCHES で打ち切り(truncated = true)。
//   - SSRM の未ロード行(getRow が undefined)は読み飛ばします(ロード済み範囲だけが対象)。
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';
import { runChunked } from '../logic/chunkedLoop';
import {
  buildFindIndex,
  findRangesInText,
  resolveCurrentAfterRescan,
  resolveFindCellText,
  stepFindIndex,
  type FindIndex,
  type FindMatch,
} from '../logic/find';
import { createValueStore } from '../logic/valueStore';
import { isSyntheticColumnKey } from '../logic/detailRow';

export type FindChangeParams = {
  query: string;
  matchCount: number;
  // 0 始まりのカレント(ヒットなしは null)。
  currentIndex: number | null;
  open: boolean;
};

export type FindArgs<T> = {
  enabled: boolean;
  rowModel: RowModel<T>;
  // 走査する列(視覚順の論理列。合成列は読み飛ばす。colIndex はこの配列の index)。
  columns: readonly GridColumn<T>[];
  caseSensitive: boolean;
  onNavigate: (rowIndex: number, colIndex: number) => void;
  onChange?: (params: FindChangeParams) => void;
};

export type FindSnapshot = {
  open: boolean;
  query: string;
  matches: readonly FindMatch[];
  index: FindIndex;
  currentIndex: number | null;
  scanning: boolean;
  truncated: boolean;
};

export type FindController<T> = {
  update: (args: FindArgs<T>) => void;
  open: (query?: string) => void;
  close: () => void;
  setQuery: (query: string) => void;
  next: () => void;
  prev: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => FindSnapshot;
  dispose: () => void;
};

export const MAX_FIND_MATCHES = 10000;

const EMPTY_INDEX: FindIndex = new Map();

export const createFindController = <T,>(): FindController<T> => {
  let args: FindArgs<T> | null = null;
  let generation = 0;
  let scanned: { rowModel: RowModel<T>; columns: readonly GridColumn<T>[]; query: string; caseSensitive: boolean } | null =
    null;
  const store = createValueStore<FindSnapshot>({
    open: false,
    query: '',
    matches: [],
    index: EMPTY_INDEX,
    currentIndex: null,
    scanning: false,
    truncated: false,
  });

  const patch = (next: Partial<FindSnapshot>) => {
    store.setSnapshot({ ...store.getSnapshot(), ...next });
  };

  const notify = () => {
    const s = store.getSnapshot();
    args?.onChange?.({ query: s.query, matchCount: s.matches.length, currentIndex: s.currentIndex, open: s.open });
  };

  const navigateToCurrent = () => {
    const s = store.getSnapshot();
    if (s.currentIndex === null) {
      return;
    }
    const match = s.matches[s.currentIndex];
    if (match) {
      args?.onNavigate(match.rowIndex, match.colIndex);
    }
  };

  const clearResults = () => {
    generation += 1;
    scanned = null;
    patch({ matches: [], index: EMPTY_INDEX, currentIndex: null, scanning: false, truncated: false });
  };

  // 走査(時間分割)。完了時にカレントを決めて onNavigate。
  const rescan = (navigate: boolean) => {
    const current = args;
    const s = store.getSnapshot();
    if (!current || !s.open || s.query.length === 0) {
      clearResults();
      notify();
      return;
    }
    generation += 1;
    const myGeneration = generation;
    const { rowModel, columns, caseSensitive } = current;
    const query = s.query;
    scanned = { rowModel, columns, query, caseSensitive };
    const previousCurrent = s.currentIndex === null ? null : (s.matches[s.currentIndex] ?? null);
    const matches: FindMatch[] = [];
    let truncated = false;
    const total = rowModel.getRowCount();
    patch({ scanning: true });
    void runChunked(
      total,
      (rowIndex) => {
        if (truncated) {
          return;
        }
        const row = rowModel.getRow(rowIndex);
        if (row === undefined) {
          return;
        }
        columns.forEach((column, colIndex) => {
          if (truncated || isSyntheticColumnKey(column.key)) {
            return;
          }
          const text = resolveFindCellText(column, row);
          for (const range of findRangesInText(text, query, caseSensitive)) {
            if (matches.length >= MAX_FIND_MATCHES) {
              truncated = true;
              return;
            }
            matches.push({ rowIndex, colIndex, columnKey: String(column.key), start: range.start, length: range.length });
          }
        });
      },
      { isCancelled: () => generation !== myGeneration },
    ).then((completed) => {
      if (!completed || generation !== myGeneration) {
        return;
      }
      const currentIndex = resolveCurrentAfterRescan(matches, previousCurrent);
      patch({ matches, index: buildFindIndex(matches), currentIndex, scanning: false, truncated });
      notify();
      if (navigate) {
        navigateToCurrent();
      }
    });
  };

  const needsRescan = (): boolean => {
    const s = store.getSnapshot();
    if (!args || !s.open || s.query.length === 0) {
      return false;
    }
    return (
      scanned === null ||
      scanned.rowModel !== args.rowModel ||
      scanned.columns !== args.columns ||
      scanned.query !== s.query ||
      scanned.caseSensitive !== args.caseSensitive
    );
  };

  return {
    update: (next) => {
      const previous = args;
      args = next;
      if (!next.enabled) {
        if (store.getSnapshot().open) {
          patch({ open: false, query: '' });
          clearResults();
          notify();
        }
        return;
      }
      // rowModel / 列 / 大文字小文字の変化で再走査(開いていてクエリがあるときだけ)。カレントの移動はしない。
      if (previous !== next && needsRescan()) {
        rescan(false);
      }
    },
    open: (query) => {
      if (!args?.enabled) {
        return;
      }
      const s = store.getSnapshot();
      const nextQuery = query ?? s.query;
      patch({ open: true, query: nextQuery });
      if (nextQuery !== s.query || !s.open) {
        rescan(true);
      } else {
        notify();
      }
    },
    close: () => {
      const s = store.getSnapshot();
      if (!s.open) {
        return;
      }
      patch({ open: false, query: '' });
      clearResults();
      notify();
    },
    setQuery: (query) => {
      const s = store.getSnapshot();
      if (!s.open || query === s.query) {
        return;
      }
      patch({ query });
      rescan(true);
    },
    next: () => {
      const s = store.getSnapshot();
      const currentIndex = stepFindIndex(s.currentIndex, s.matches.length, 1);
      patch({ currentIndex });
      notify();
      navigateToCurrent();
    },
    prev: () => {
      const s = store.getSnapshot();
      const currentIndex = stepFindIndex(s.currentIndex, s.matches.length, -1);
      patch({ currentIndex });
      notify();
      navigateToCurrent();
    },
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    dispose: () => {
      generation += 1;
      args = null;
    },
  };
};
