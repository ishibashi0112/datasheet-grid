// auto-height 行の行高ストアです(prefix-sum 版 RowMetrics の供給元)。
//
// 目的(C1: auto-height 本体):
//   uniform 行高では行位置 = index*rowHeight の純算術で済みますが、auto-height では行ごとに
//   高さが異なるため prefix-sum(累積和)で rowTop/rowsHeight/rowAtContentY を提供します。
//   ★gate(論理全高 < MAX_BODY_PX / 行数 <= AUTO_HEIGHT_MAX_ROWS)前提なので、scaling・float32
//     対策・基準オフセットは休眠(sf=1 / offset=0 / translateY=0)。よって Fenwick 不要・素の
//     Float64Array prefix-sum で足り、O(n) の前方再構築も n <= 50,000 で安価です。
//
// 設計:
//   - 行高の実測値は rowKey でキャッシュ(measured: Map)。filter/sort で view 順が変わっても
//     行の実体(rowKey)の内容高は不変なので、view 順の付け替えだけで再測定が不要になります。
//   - view 順の heights / prefix は buildRowHeightStore で getRowKey から引き直して構築します
//     (未測定行は estimate)。
//   - 測定 flush: setMeasuredRowHeight で measured + heights を更新し、最小変更 index から
//     rebuildPrefixFrom で prefix を 1 回だけ前方再構築します(行ごとには再構築しません)。
//   - createAutoHeightRowMetrics は store の prefix を読む RowMetrics(uniform と同契約)。
//     rowAtContentY は prefix 上の二分探索。estimate 一様・measured 空のとき uniform と一致します。

import type { GridRowKey } from '../model/gridTypes';
import type { RowMetrics } from './verticalGeometry';

export type RowHeightStore = {
  // view 行数(= heights の長さ)。
  rowCount: number;
  // 未測定行に使う 1 行の推定高さ(px)。
  estimate: number;
  // view 順の行高(measured があればその値、無ければ estimate)。
  heights: Float64Array;
  // 累積和。prefix[i] = heights[0..i-1] の和。prefix[0]=0 / prefix[rowCount]=論理全高。
  prefix: Float64Array;
  // rowKey → 実測高さ(view 非依存の永続キャッシュ)。
  measured: Map<GridRowKey, number>;
};

// prefix を [fromIndex, rowCount] の範囲で前方再構築します。
//   prefix[fromIndex] を起点に prefix[j+1] = prefix[j] + heights[j] を順に埋めます。
//   測定 flush では「最小変更 index」を渡し、1 回だけ呼びます(行ごと再構築の回避)。
export const rebuildPrefixFrom = (
  store: RowHeightStore,
  fromIndex: number,
): void => {
  const { heights, prefix, rowCount } = store;
  const from = Math.max(fromIndex, 0);
  for (let j = from; j < rowCount; j += 1) {
    prefix[j + 1] = prefix[j] + heights[j];
  }
};

// view 順(getRowKey)・estimate・既存 measured キャッシュから store を構築します。
//   heights[i] = measured.get(getRowKey(i)) ?? estimate。prefix は全域を一括構築します。
//   measured を渡すと再構築でも実測値が維持されます(view 順だけ付け替え)。
export const buildRowHeightStore = (
  rowCount: number,
  estimate: number,
  getRowKey: (viewIndex: number) => GridRowKey,
  measured?: Map<GridRowKey, number>,
): RowHeightStore => {
  const cache = measured ?? new Map<GridRowKey, number>();
  const safeCount = Math.max(rowCount, 0);
  const heights = new Float64Array(safeCount);
  for (let i = 0; i < safeCount; i += 1) {
    const cached = cache.get(getRowKey(i));
    heights[i] = cached !== undefined ? cached : estimate;
  }
  // prefix[0]=0 は Float64Array 既定で 0。全域を前方構築します。
  const prefix = new Float64Array(safeCount + 1);
  const store: RowHeightStore = {
    rowCount: safeCount,
    estimate,
    heights,
    prefix,
    measured: cache,
  };
  rebuildPrefixFrom(store, 0);
  return store;
};

// 1 行の実測高さを反映します(measured キャッシュ + heights を更新)。
//   prefix は呼び出し側が flush でまとめて rebuildPrefixFrom します(ここでは更新しません)。
//   戻り値: 高さが実際に変わったか(prefix 再構築の要否判定に使用)。
export const setMeasuredRowHeight = (
  store: RowHeightStore,
  viewIndex: number,
  rowKey: GridRowKey,
  height: number,
): boolean => {
  if (viewIndex < 0 || viewIndex >= store.rowCount) {
    return false;
  }
  // 実測値は view 非依存に保持(view 順が変わっても再測定不要)。
  store.measured.set(rowKey, height);
  if (store.heights[viewIndex] === height) {
    return false;
  }
  store.heights[viewIndex] = height;
  return true;
};

// content-top 基準 y(論理)→ 行 index。prefix 上で「prefix[i] <= y を満たす最大 i」を
//   二分探索し [0, rowCount-1] へ clamp します。estimate 一様・measured 空のとき
//   floor(y / rowHeight) と一致します。
const rowAtContentYFromPrefix = (
  prefix: Float64Array,
  rowCount: number,
  y: number,
): number => {
  if (rowCount <= 0 || y <= 0) {
    return 0;
  }
  // prefix[rowCount] = 論理全高。これ以上は末尾行へ clamp。
  if (y >= prefix[rowCount]) {
    return rowCount - 1;
  }
  // prefix は単調非減少。不変条件 prefix[lo] <= y を保ちつつ上限を詰めます。
  let lo = 0;
  let hi = rowCount;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (prefix[mid] <= y) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  // lo は prefix[lo] <= y を満たす最大 index(y < prefix[rowCount] より lo <= rowCount-1)。
  return Math.min(Math.max(lo, 0), rowCount - 1);
};

// store の prefix を読む auto-height 版 RowMetrics(uniform と同契約)。
//   rowTop / rowsHeight は O(1)、rowAtContentY は O(log n)。clamp は防御(正常範囲では no-op)。
export const createAutoHeightRowMetrics = (
  store: RowHeightStore,
): RowMetrics => {
  const { prefix, rowCount } = store;
  return {
    rowCount,
    rowTop: (index) => prefix[Math.min(Math.max(index, 0), rowCount)],
    rowsHeight: (startInclusive, endInclusive) =>
      prefix[Math.min(Math.max(endInclusive + 1, 0), rowCount)] -
      prefix[Math.min(Math.max(startInclusive, 0), rowCount)],
    totalBodyHeight: prefix[rowCount],
    rowAtContentY: (y) => rowAtContentYFromPrefix(prefix, rowCount, y),
  };
};