// 追加(バッチ②/コンテキストメニュー): 右クリック対象(セル/行)の解決に使う純ロジックです。
//   DOM 逆引き(SpreadsheetGrid 側の委譲ハンドラ)から得た「列キー」「行 index」を、公開 params の
//   colIndex / isTargetSelected へ変換する部分だけを副作用なしで切り出しています(テスト対象)。
//   メニューの開閉・配線は useCellContextMenuController / SpreadsheetGrid 側が担います。
import type { GridColumn, GridSelection } from '../model/gridTypes';

// 右クリックされたセルの列キーから論理列 index(視覚順 左→中央→右 = orderedColumns 上の index)を
//   引きます。見つからなければ -1。handle.selectCell などが使う colIndex と同一空間の値を返します。
export const resolveContextMenuColIndex = <T,>(
  orderedColumns: GridColumn<T>[],
  columnKey: string,
): number => orderedColumns.findIndex((column) => column.key === columnKey);

// セル(row,col)が現在のセル範囲選択(GridSelection)に含まれるかの判定です。
//   body の isSelected と同じ規則: row 選択は行内の全列 / cell 選択は矩形 / col 選択は列区間。
//   params.isTargetSelected(cell target)の算出に使います(チェックボックス行選択とは別概念)。
export const isContextMenuCellSelected = (
  selection: GridSelection,
  rowIndex: number,
  colIndex: number,
): boolean => {
  if (!selection) {
    return false;
  }
  if (selection.type === 'row') {
    return rowIndex >= selection.startRow && rowIndex <= selection.endRow;
  }
  if (selection.type === 'col') {
    return colIndex >= selection.startCol && colIndex <= selection.endCol;
  }
  // type 'cell'。start/end は正規化されていない場合があるため min/max で吸収します。
  const { start, end } = selection.range;
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  return (
    rowIndex >= minRow &&
    rowIndex <= maxRow &&
    colIndex >= minCol &&
    colIndex <= maxCol
  );
};

// 行(rowHeader target)が現在のセル範囲選択に含まれるかの判定です。
//   row / cell 選択は行区間で判定し、col 選択は「列」を選ぶ概念のため行は非選択(false)扱いです。
//   params.isTargetSelected(rowHeader target)の算出に使います。
export const isContextMenuRowSelected = (
  selection: GridSelection,
  rowIndex: number,
): boolean => {
  if (!selection) {
    return false;
  }
  if (selection.type === 'row') {
    return rowIndex >= selection.startRow && rowIndex <= selection.endRow;
  }
  if (selection.type === 'cell') {
    const { start, end } = selection.range;
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    return rowIndex >= minRow && rowIndex <= maxRow;
  }
  return false;
};