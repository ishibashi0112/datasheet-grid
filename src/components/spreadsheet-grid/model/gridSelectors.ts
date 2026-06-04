import type { CellCoord, CellRange, GridUiState } from './gridTypes';

// 追加: セル範囲を正規化して左上/右下を求めるユーティリティです。
export const normalizeCellRange = (range: CellRange): CellRange => ({
  start: {
    row: Math.min(range.start.row, range.end.row),
    col: Math.min(range.start.col, range.end.col),
  },
  end: {
    row: Math.max(range.start.row, range.end.row),
    col: Math.max(range.start.col, range.end.col),
  },
});

// 追加: activeCell を取得します。
export const selectActiveCell = (state: GridUiState) => state.activeCell;

// 追加: selection を取得します。
export const selectSelection = (state: GridUiState) => state.selection;

// 追加: editingCell を取得します。
export const selectEditingCell = (state: GridUiState) => state.editingCell;

// 追加: 列幅を取得します。
export const selectColumnWidth = (state: GridUiState, columnKey: string) =>
  state.columnWidths[columnKey];

// 追加: グローバルフィルター値を取得します。
export const selectGlobalFilter = (state: GridUiState) => state.filters.globalText;

// 追加: 列フィルター値を取得します。
export const selectColumnFilter = (state: GridUiState, columnKey: string) =>
  state.filters.columnFilters[columnKey];

// 追加: active cell 判定です。
export const selectIsActiveCell = (
  state: GridUiState,
  rowIndex: number,
  colIndex: number,
) =>
  state.activeCell?.row === rowIndex && state.activeCell?.col === colIndex;

// 追加: editing cell 判定です。
export const selectIsEditingCell = (
  state: GridUiState,
  rowIndex: number,
  colIndex: number,
) =>
  state.editingCell?.row === rowIndex && state.editingCell?.col === colIndex;

// 追加: cell selection 判定です。row/col selection は将来拡張対象です。
export const selectIsCellSelected = (
  state: GridUiState,
  rowIndex: number,
  colIndex: number,
) => {
  if (state.selection?.type !== 'cell') {
    return false;
  }

  const normalizedRange = normalizeCellRange(state.selection.range);

  return (
    rowIndex >= normalizedRange.start.row &&
    rowIndex <= normalizedRange.end.row &&
    colIndex >= normalizedRange.start.col &&
    colIndex <= normalizedRange.end.col
  );
};

// 追加: 座標一致判定です。今後 keyboard 操作などで再利用できます。
export const isSameCellCoord = (
  left: CellCoord | null,
  right: CellCoord | null,
) => {
  if (!left || !right) {
    return false;
  }

  return left.row === right.row && left.col === right.col;
};