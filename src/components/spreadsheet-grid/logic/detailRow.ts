// 展開行(Master/Detail)の純ロジックです(detail batch 3)。
//
// 設計(合意済み):
//   - 展開行は「マスター行の直下に続く帯」で、表示行リスト(order / view index)には一切手を入れません。
//     帯の高さは RowMetrics デコレータ(createDetailRowMetrics)で疎に足します。
//   - 展開状態は rowKey(値ベース)で持ち、描画のたびに rowKey → view index を解決します。
//     解決は「前回の view index をキャッシュし、getRowKey(cached) === key で O(1) 検証、外れたら走査」
//     (走査は clientSide のみ。serverSide は未ロード行のキーが取れないため、キャッシュ(トグル時に
//     セル側から seed される)が外れたキーは解決不能として扱います)。
//   - 解決不能なキー(フィルター除外 / 未ロード / 削除済み)は帯を作らず、状態としてだけ残ります。
import type { GridRowKey, RowModel } from '../model/gridTypes';
import { GROUP_AUTO_COLUMN_KEY } from './grouping';
import type { DetailRowExtra, RowMetrics } from './verticalGeometry';

// 専用トグル列(T1)の合成列キーと幅です。consumer の columns には現れません。
export const DETAIL_TOGGLE_COLUMN_KEY = '__ssg_detail_toggle__';
export const DETAIL_TOGGLE_COLUMN_WIDTH = 28;
// 展開行の帯の既定高(px)。
export const DEFAULT_DETAIL_ROW_HEIGHT = 200;

// ライブラリが合成する列(自動グループ列 / 展開行トグル列)か。列メニュー / 並べ替え DnD / ソート /
//   エクスポートの対象外判定に使います。
export const isSyntheticColumnKey = (key: string): boolean =>
  key === GROUP_AUTO_COLUMN_KEY || key === DETAIL_TOGGLE_COLUMN_KEY;

// 要素が展開行カード(data-ssg-detail)の内側にあるか。カードの中身は消費側 UI(入れ子のグリッドも
//   あり得る)のため、グリッド本体の DOM クエリ(auto-height 実測 / 列ヘッダー探索)から除外し、
//   フォーカスがカード内にあるあいだは grid root へフォーカスを戻しません(detail batch 4)。
export const isInsideDetailCard = (
  element: Element | null | undefined,
): boolean =>
  element != null &&
  typeof element.closest === 'function' &&
  element.closest('[data-ssg-detail]') !== null;

export const isFocusInsideDetailCard = (): boolean =>
  typeof document !== 'undefined' && isInsideDetailCard(document.activeElement);

// root(このグリッドの .ssg-root / スクロールコンテナ)配下の展開行カードの中にある要素か。
//   DOM 走査(自動高さ実測 / 列キー検索)から「カード内に消費側がネストしたグリッド」の要素を
//   除外するために使います。root 自身が別グリッドのカード内にある場合(外側から見て root 全体が
//   カード内)は除外しないよう、最寄りのカードが root に含まれるかで判定します。
export const isInsideDetailCardOf = (
  root: Element,
  element: Element,
): boolean => {
  if (typeof element.closest !== 'function') {
    return false;
  }
  const card = element.closest('[data-ssg-detail]');
  return card !== null && card !== root && root.contains(card);
};

// rowKey → view index の解決キャッシュです(コンポーネントの ref に保持)。
//   unresolved は「この rowModel では見つからなかったキー」の記録で、同じ rowModel のあいだは
//   走査を繰り返しません(フィルター除外中のキーで毎レンダー O(n) 走査するのを防ぐ)。
export type DetailIndexCache = {
  indexByKey: Map<GridRowKey, number>;
  unresolvedFor: RowModel<unknown> | null;
  unresolved: Set<GridRowKey>;
};

export const createDetailIndexCache = (): DetailIndexCache => ({
  indexByKey: new Map(),
  unresolvedFor: null,
  unresolved: new Set(),
});

export type ResolveDetailRowExtrasArgs<T> = {
  expandedKeys: ReadonlySet<GridRowKey>;
  rowModel: RowModel<T>;
  // 帯の高さ(px)。
  height: number;
  isExpandable?: (row: T, ctx: { rowKey: GridRowKey; sourceRowIndex: number }) => boolean;
  cache: DetailIndexCache;
  // serverSide では全行走査を行いません(未ロード行の rowKey が取れないため)。
  allowScan: boolean;
};

// 展開中キー集合を「view index 昇順の追加高リスト」へ解決します(createDetailRowMetrics の入力)。
//   行が取れない(グループ行 / 未ロード / OOB)・isExpandable が false のキーは除外します。
export const resolveDetailRowExtras = <T>({
  expandedKeys,
  rowModel,
  height,
  isExpandable,
  cache,
  allowScan,
}: ResolveDetailRowExtrasArgs<T>): DetailRowExtra[] => {
  if (expandedKeys.size === 0 || height <= 0) {
    return [];
  }
  const rowCount = rowModel.getRowCount();
  const resolved = new Map<GridRowKey, number>();
  let pending: Set<GridRowKey> | null = null;

  // 1. キャッシュ検証(O(1) / キー)。
  for (const key of expandedKeys) {
    const cached = cache.indexByKey.get(key);
    if (
      cached !== undefined &&
      cached >= 0 &&
      cached < rowCount &&
      rowModel.getRowKey(cached) === key
    ) {
      resolved.set(key, cached);
      continue;
    }
    if (cache.unresolvedFor === rowModel && cache.unresolved.has(key)) {
      continue;
    }
    (pending ??= new Set()).add(key);
  }

  // 2. 外れたキーの走査(clientSide のみ。見つかり次第 early exit)。
  if (pending && pending.size > 0) {
    if (allowScan) {
      for (let index = 0; index < rowCount && pending.size > 0; index += 1) {
        const key = rowModel.getRowKey(index);
        if (pending.has(key)) {
          cache.indexByKey.set(key, index);
          resolved.set(key, index);
          pending.delete(key);
        }
      }
    }
    // 見つからなかったキーは、この rowModel のあいだ再走査しません。
    if (pending.size > 0) {
      if (cache.unresolvedFor !== rowModel) {
        cache.unresolvedFor = rowModel as RowModel<unknown>;
        cache.unresolved.clear();
      }
      for (const key of pending) {
        cache.unresolved.add(key);
      }
    }
  }

  // 3. 行の存在と展開可否で絞り込み、index 昇順へ。
  const extras: DetailRowExtra[] = [];
  for (const [key, index] of resolved) {
    const row = rowModel.getRow(index) as T | undefined;
    if (row === undefined) {
      continue;
    }
    if (
      isExpandable &&
      !isExpandable(row, { rowKey: key, sourceRowIndex: rowModel.getSourceIndex(index) })
    ) {
      continue;
    }
    extras.push({ index, height });
  }
  extras.sort((a, b) => a.index - b.index);
  return extras;
};

// トグル時に「そのセルの view index」でキャッシュを seed します(serverSide でも走査なしで解決できる)。
export const seedDetailIndexCache = (
  cache: DetailIndexCache,
  rowKey: GridRowKey,
  viewIndex: number,
): void => {
  cache.indexByKey.set(rowKey, viewIndex);
  cache.unresolved.delete(rowKey);
};

// 選択オーバーレイの縦帯 [startRow, endRow](inclusive)を、区間内の展開行の detail 帯を避けた
//   複数セグメント(content-top 基準の top / height)へ分割します。区間内に展開行がなければ
//   従来どおり 1 セグメント(top = rowTop(start) / height = rowsHeight(start, end))です。
export const splitRowBandByDetail = (
  startRow: number,
  endRow: number,
  rowMetrics: RowMetrics,
  extras: readonly DetailRowExtra[],
): Array<{ top: number; height: number }> => {
  const segments: Array<{ top: number; height: number }> = [];
  let segmentStart = startRow;
  for (const extra of extras) {
    if (extra.index < startRow) {
      continue;
    }
    if (extra.index > endRow) {
      break;
    }
    // [segmentStart, extra.index] のセル行までを 1 セグメントにし、detail 帯を飛ばします。
    const top = rowMetrics.rowTop(segmentStart);
    const bottom = rowMetrics.rowTop(extra.index) + rowMetrics.cellHeight(extra.index);
    segments.push({ top, height: bottom - top });
    segmentStart = extra.index + 1;
  }
  if (segmentStart <= endRow) {
    segments.push({
      top: rowMetrics.rowTop(segmentStart),
      height: rowMetrics.rowsHeight(segmentStart, endRow),
    });
  }
  return segments;
};