// 追加(row-drag ①): 行ドラッグ並び替えの純ロジックです。DOM / React に依存しません。
//   - 配列の 1 要素移動(moveArrayItem)と、ドロップスロット → 移動先 index の解決。
//   - ポインタ y(content-top 基準の論理 y)→ ドロップスロット(0..rowCount)の解決。
//     行メトリクス(RowMetrics)越しに行 top / セル行高を読むため、uniform / auto-height /
//     展開行(detail 帯)のいずれでも同じ式で動きます。
//   - 有効化ゲート: 表示順(order)が元配列の恒等順のときだけ並び替えを許可します
//     (ソート / フィルター / グルーピング中は「表示上の前後」と「配列内の前後」が一致せず、
//      移動の意味が曖昧になるため。AG Grid の managed row dragging と同じ方針)。
import type { RowMetrics } from './verticalGeometry';

// 行ドラッグハンドル列(合成列)のキーと幅です。展開行トグル列(detailRow)と同じ流儀で、
//   consumer の columns には現れず、先頭(左固定列があれば左ペイン)へ注入されます。
export const ROW_DRAG_HANDLE_COLUMN_KEY = '__ssg_row_drag_handle__';
export const ROW_DRAG_HANDLE_COLUMN_WIDTH = 28;

// 配列の fromIndex の要素を toIndex(移動後の位置)へ移した新配列を返します。
//   入力配列は変更しません。範囲外 / 同一位置は no-op として「入力と同じ参照」を返します
//   (呼び出し側が参照比較で no-op を判定し、onRowsChange / 履歴 push を省けるように)。
export const moveArrayItem = <T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): readonly T[] => {
  const length = items.length;
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= length ||
    toIndex < 0 ||
    toIndex >= length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item as T);
  return next;
};

// ドロップスロット(行 i の「上の境界」= i。末尾は rowCount)から、moveArrayItem に渡す
//   移動後 index を解決します。掴んだ行の直上 / 直下の境界は「動かない」ため null(no-op)。
//   from より後ろのスロットは、from を抜いた分だけ 1 つ前へ詰まります。
export const resolveMoveTargetIndex = (
  fromIndex: number,
  dropSlot: number,
): number | null => {
  if (dropSlot === fromIndex || dropSlot === fromIndex + 1) {
    return null;
  }
  return dropSlot > fromIndex ? dropSlot - 1 : dropSlot;
};

// content-top 基準の論理 y → ドロップスロット(0..rowCount)。
//   行のセル部分の上半分なら「その行の上」(= i)、下半分なら「その行の下」(= i + 1)。
//   展開行(detail 帯)の上は常に「その行の下」(帯はマスター行に付随して一緒に動くため)。
//   y は [0, totalBodyHeight] へ clamp します(端の autoscroll 中に枠外へ出ても安全)。
export const resolveRowDropSlot = (
  contentY: number,
  rowMetrics: RowMetrics,
): number => {
  const { rowCount } = rowMetrics;
  if (rowCount <= 0) {
    return 0;
  }
  if (contentY <= 0) {
    return 0;
  }
  if (contentY >= rowMetrics.totalBodyHeight) {
    return rowCount;
  }
  const index = rowMetrics.rowAtContentY(contentY);
  const offsetInRow = contentY - rowMetrics.rowTop(index);
  const cellHeight = rowMetrics.cellHeight(index);
  return offsetInRow < cellHeight / 2 ? index : index + 1;
};

// ドロップスロットのガイド線 y(content-top 基準の論理 y)。slot = rowCount は全高(末尾)。
export const resolveRowDropSlotTop = (
  slot: number,
  rowMetrics: RowMetrics,
): number => {
  const { rowCount } = rowMetrics;
  if (rowCount <= 0 || slot <= 0) {
    return 0;
  }
  if (slot >= rowCount) {
    return rowMetrics.totalBodyHeight;
  }
  return rowMetrics.rowTop(slot);
};

// order(view 順の source index 列)が恒等順 [0..rowCount-1] かどうか。
//   長さ不一致(フィルターで行が減っている)は即 false。O(n) ですが order 参照が変わったときだけ
//   評価する(useMemo)前提です。
export const isIdentityOrder = (
  order: ArrayLike<number>,
  rowCount: number,
): boolean => {
  if (order.length !== rowCount) {
    return false;
  }
  for (let i = 0; i < rowCount; i += 1) {
    if (order[i] !== i) {
      return false;
    }
  }
  return true;
};

export type RowDragAvailabilityArgs = {
  enableRowDrag: boolean;
  isServerSide: boolean;
  rowGroupingActive: boolean;
  hasRowsChange: boolean;
};

// ハンドル列を「出すかどうか」(機能そのものが利用可能か)。
//   serverSide / 行グルーピング / onRowsChange 未指定では並び替え結果を反映できないため出しません。
//   (ソート / フィルター中は列は出したまま操作だけ無効にします → isRowDragOperable)
export const isRowDragAvailable = ({
  enableRowDrag,
  isServerSide,
  rowGroupingActive,
  hasRowsChange,
}: RowDragAvailabilityArgs): boolean =>
  enableRowDrag && !isServerSide && !rowGroupingActive && hasRowsChange;

// ハンドルが「今 操作できるか」。表示順が恒等(ソート / フィルターなし)のときだけ true。
export const isRowDragOperable = (
  available: boolean,
  orderIsIdentity: boolean,
): boolean => available && orderIsIdentity;

// 操作不可(ソート / フィルター中)のハンドルに出すツールチップ文言です。
export const ROW_DRAG_DISABLED_TOOLTIP =
  'ソート / フィルター適用中は行を並び替えできません';
export const ROW_DRAG_HANDLE_TOOLTIP = 'ドラッグで行を移動';