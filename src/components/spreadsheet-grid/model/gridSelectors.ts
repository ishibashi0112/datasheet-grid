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

// 追加: 行選択範囲を正規化します。
export const normalizeRowRange = (startRow: number, endRow: number) => ({
  startRow: Math.min(startRow, endRow),
  endRow: Math.max(startRow, endRow),
});

// 追加: 列選択範囲を正規化します。
export const normalizeColumnRange = (startCol: number, endCol: number) => ({
  startCol: Math.min(startCol, endCol),
  endCol: Math.max(startCol, endCol),
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

// 追加: cell selection 判定です。row/col selection も含めて判定します。
export const selectIsCellSelected = (
  state: GridUiState,
  rowIndex: number,
  colIndex: number,
) => {
  if (!state.selection) {
    return false;
  }

  if (state.selection.type === 'cell') {
    const normalizedRange = normalizeCellRange(state.selection.range);

    return (
      rowIndex >= normalizedRange.start.row &&
      rowIndex <= normalizedRange.end.row &&
      colIndex >= normalizedRange.start.col &&
      colIndex <= normalizedRange.end.col
    );
  }

  if (state.selection.type === 'row') {
    const normalizedRange = normalizeRowRange(
      state.selection.startRow,
      state.selection.endRow,
    );

    return (
      rowIndex >= normalizedRange.startRow &&
      rowIndex <= normalizedRange.endRow
    );
  }

  if (state.selection.type === 'col') {
    const normalizedRange = normalizeColumnRange(
      state.selection.startCol,
      state.selection.endCol,
    );

    return (
      colIndex >= normalizedRange.startCol &&
      colIndex <= normalizedRange.endCol
    );
  }

  return false;
};

// 追加: 行ヘッダー用の選択判定です。
export const selectIsRowSelected = (state: GridUiState, rowIndex: number) => {
  if (state.selection?.type !== 'row') {
    return false;
  }

  const normalizedRange = normalizeRowRange(
    state.selection.startRow,
    state.selection.endRow,
  );

  return (
    rowIndex >= normalizedRange.startRow && rowIndex <= normalizedRange.endRow
  );
};

// 追加: 列ヘッダー用の選択判定です。
export const selectIsColumnSelected = (state: GridUiState, colIndex: number) => {
  if (state.selection?.type !== 'col') {
    return false;
  }

  const normalizedRange = normalizeColumnRange(
    state.selection.startCol,
    state.selection.endCol,
  );

  return (
    colIndex >= normalizedRange.startCol && colIndex <= normalizedRange.endCol
  );
};

// ────────────────────────────────────────────────
// 追加(11-A): 正規化済み選択スナップショットです。
// 変更理由: GridBodyRow(memo) / GridHeaderRow へ uiState を丸ごと渡すと、
//           selection / activeCell / dragState 等のあらゆる更新で props 参照が
//           変わり memo が全行で破られていました。selection を「種類 + 正規化済み
//           範囲」へ畳み込み、selection が変わったときだけ参照が変わる小さな
//           オブジェクトとして配ります。行側はさらにプリミティブ値へ分解します。
// ────────────────────────────────────────────────
export type SelectionSnapshot =
  | { kind: 'none' }
  | {
      kind: 'cell';
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    }
  | { kind: 'row'; startRow: number; endRow: number }
  | { kind: 'col'; startCol: number; endCol: number };

// 追加(11-A): GridSelection から SelectionSnapshot を構築します。
//             判定ロジックは selectIsCellSelected / selectIsRowSelected /
//             selectIsColumnSelected と完全に等価になるよう正規化します。
export const buildSelectionSnapshot = (
  selection: GridUiState['selection'],
): SelectionSnapshot => {
  if (!selection) {
    return { kind: 'none' };
  }

  if (selection.type === 'cell') {
    const normalizedRange = normalizeCellRange(selection.range);
    return {
      kind: 'cell',
      startRow: normalizedRange.start.row,
      endRow: normalizedRange.end.row,
      startCol: normalizedRange.start.col,
      endCol: normalizedRange.end.col,
    };
  }

  if (selection.type === 'row') {
    const normalizedRange = normalizeRowRange(
      selection.startRow,
      selection.endRow,
    );
    return {
      kind: 'row',
      startRow: normalizedRange.startRow,
      endRow: normalizedRange.endRow,
    };
  }

  const normalizedRange = normalizeColumnRange(
    selection.startCol,
    selection.endCol,
  );
  return {
    kind: 'col',
    startCol: normalizedRange.startCol,
    endCol: normalizedRange.endCol,
  };
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