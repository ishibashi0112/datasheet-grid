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
  isFindableColumn,
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
  // 追加(1.0.2 / レビュー QB-1): 条件付き書式(状態チップ / データバー)を描くか(既定 true)。描かない構成(`/lite` で
  //   条件付き書式の機能が無い)では、画面に出ていないチップの label ではなく値の文字を探し、データバーの
  //   showValue: false の列も(値の文字が出るので)探します。
  conditionalFormat?: boolean | undefined;
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
// 行ごとのヒットを控える表の大きさ(グローバルフィルターの時間分割と同じ 5 万行)。
export const FIND_HIT_CACHE_ROW_THRESHOLD = 50_000;

const EMPTY_INDEX: FindIndex = new Map();

// 行ごとのヒット(行の中の列と位置)。
type RowFindHit = { colIndex: number; columnKey: string; start: number; length: number };
const NO_ROW_HITS: readonly RowFindHit[] = [];

const isSameMatches = (a: readonly FindMatch[], b: readonly FindMatch[]): boolean =>
  a.length === b.length &&
  a.every((match, index) => {
    const other = b[index];
    return (
      match.rowIndex === other.rowIndex &&
      match.colIndex === other.colIndex &&
      match.columnKey === other.columnKey &&
      match.start === other.start &&
      match.length === other.length
    );
  });

export const createFindController = <T,>(): FindController<T> => {
  let args: FindArgs<T> | null = null;
  let generation = 0;
  // 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-19): 行(オブジェクト)ごとのヒットの控えです(クエリ・大文字小文字・列が
  //   同じ間だけ)。rows がよく変わる表(毎秒行を足すログなど)では、行が変わるたびに最初から走査し直して 100 万行では
  //   終わらず、「検索中…」のままだった。同じ行のオブジェクトは読み直さないので、やり直しは足した / 変えた行だけで済みます。
  let hitCache: {
    columns: readonly GridColumn<T>[];
    query: string;
    caseSensitive: boolean;
    conditionalFormatShown: boolean;
    byRow: WeakMap<object, readonly RowFindHit[]>;
  } | null = null;
  // 追加(1.0.1 / AP-19): 打った直後の走査(最初のヒットへ移る)が、行の変化によるやり直しで取り消されても移動を忘れない。
  let pendingNavigate = false;
  let scanned: {
    rowModel: RowModel<T>;
    columns: readonly GridColumn<T>[];
    query: string;
    caseSensitive: boolean;
    conditionalFormatShown: boolean;
  } | null = null;
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

  // 変更(onFindChange の連続呼び出し): 前回と同じ内容は通知しません(API の約束どおり「変わったとき」だけ)。
  //   利用側がインラインの rowKeyGetter を渡すと再レンダーごとに rowModel が作り直されて再走査になり、結果が同じでも
  //   通知していたため、onFindChange の中で setState すると「通知 → 再レンダー → 再走査 → 通知」が止まらなかった。
  let lastNotified: FindChangeParams | null = null;
  const notify = () => {
    const s = store.getSnapshot();
    const params: FindChangeParams = { query: s.query, matchCount: s.matches.length, currentIndex: s.currentIndex, open: s.open };
    if (
      lastNotified !== null &&
      lastNotified.query === params.query &&
      lastNotified.matchCount === params.matchCount &&
      lastNotified.currentIndex === params.currentIndex &&
      lastNotified.open === params.open
    ) {
      return;
    }
    lastNotified = params;
    args?.onChange?.(params);
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
    hitCache = null;
    pendingNavigate = false;
    patch({ matches: [], index: EMPTY_INDEX, currentIndex: null, scanning: false, truncated: false });
  };

  // 走査(時間分割)。完了時にカレントを決めて onNavigate。
  // 変更(1.0.1 のレビュー RB-3): 控えから返した行があった走査の後は、控えを使わずに 1 回走査し直して確かめます(fresh)。
  //   行のオブジェクトをその場で書き換えて新しい配列を渡す使い方では、同じオブジェクトの控えが古く、古い件数と印を出し続けて
  //   いた。確かめた走査の控えを次の控えにします。
  const rescan = (navigate: boolean, fresh = false) => {
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
    const conditionalFormatShown = current.conditionalFormat !== false;
    const query = s.query;
    // 変更(1.0.1 / AP-19): 同じクエリのやり直し(行・列の変化)では、走査の間も前の結果と件数を出したままにします
    //   (「検索中…」へ戻さない)。
    const sameQueryAsShown = scanned !== null && scanned.query === query && scanned.caseSensitive === caseSensitive;
    scanned = { rowModel, columns, query, caseSensitive, conditionalFormatShown };
    if (
      fresh ||
      hitCache === null ||
      hitCache.columns !== columns ||
      hitCache.query !== query ||
      hitCache.caseSensitive !== caseSensitive ||
      hitCache.conditionalFormatShown !== conditionalFormatShown
    ) {
      hitCache = { columns, query, caseSensitive, conditionalFormatShown, byRow: new WeakMap() };
    }
    const byRow = hitCache.byRow;
    let cacheHits = 0;
    const shouldNavigate = navigate || pendingNavigate;
    pendingNavigate = shouldNavigate;
    const previousCurrent = s.currentIndex === null ? null : (s.matches[s.currentIndex] ?? null);
    const matches: FindMatch[] = [];
    let truncated = false;
    const total = rowModel.getRowCount();
    // 控えは大きな表だけで使います(小さな表は毎回読み直す。列の getValue / valueFormatter が行の外の値を読んでも古くならない)。
    const useCache = total > FIND_HIT_CACHE_ROW_THRESHOLD;
    // 変更(1.0.2 / G-16): チップの label を探すため、行の位置も渡します(チップの関数へ渡す)。
    const hitsOf = (row: T, rowIndex: number): readonly RowFindHit[] => {
      const hits: RowFindHit[] = [];
      columns.forEach((column, colIndex) => {
        if (isSyntheticColumnKey(column.key) || !isFindableColumn(column, conditionalFormatShown)) {
          return;
        }
        const text = resolveFindCellText(
          column,
          row,
          !conditionalFormatShown || column.conditionalFormat?.chips === undefined
            ? undefined
            : {
                rowIndex,
                sourceRowIndex: rowModel.getSourceIndex(rowIndex) ?? rowIndex,
                rowKey: rowModel.getRowKey(rowIndex) ?? rowIndex,
                colIndex,
              },
        );
        for (const range of findRangesInText(text, query, caseSensitive)) {
          hits.push({ colIndex, columnKey: String(column.key), start: range.start, length: range.length });
        }
      });
      return hits.length === 0 ? NO_ROW_HITS : hits;
    };
    if (!sameQueryAsShown && !s.scanning) {
      patch({ scanning: true });
    }
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
        let hits: readonly RowFindHit[] | undefined;
        if (useCache && typeof row === 'object' && row !== null) {
          hits = byRow.get(row);
          if (hits === undefined) {
            hits = hitsOf(row, rowIndex);
            byRow.set(row, hits);
          } else {
            cacheHits += 1;
          }
        } else {
          hits = hitsOf(row, rowIndex);
        }
        for (const hit of hits) {
          if (matches.length >= MAX_FIND_MATCHES) {
            truncated = true;
            return;
          }
          matches.push({ rowIndex, colIndex: hit.colIndex, columnKey: hit.columnKey, start: hit.start, length: hit.length });
        }
      },
      { isCancelled: () => generation !== myGeneration },
    ).then((completed) => {
      if (!completed || generation !== myGeneration) {
        return;
      }
      pendingNavigate = false;
      // 確かめた結果が控えの結果と同じなら、そのままにします(印を描き直さない)。
      if (fresh && truncated === store.getSnapshot().truncated && isSameMatches(store.getSnapshot().matches, matches)) {
        return;
      }
      const currentIndex = resolveCurrentAfterRescan(matches, previousCurrent);
      patch({ matches, index: buildFindIndex(matches), currentIndex, scanning: false, truncated });
      notify();
      if (shouldNavigate) {
        navigateToCurrent();
      }
      if (!fresh && cacheHits > 0) {
        rescan(false, true);
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
      scanned.caseSensitive !== args.caseSensitive ||
      scanned.conditionalFormatShown !== (args.conditionalFormat !== false)
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
