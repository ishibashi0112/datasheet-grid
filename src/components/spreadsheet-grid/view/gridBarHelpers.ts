import type { ReactNode } from 'react';
import type {
  CellCoord,
  GridSelection,
  GridSortState,
  GridColumn,
  SpreadsheetGridSlotContext,
} from '../model/gridTypes';
import { toExcelColumnName } from '../utils/excelColumnName';

// 追加: Grid の slot renderer を解決します。
export const resolveGridSlot = <T,>(
  slotRenderer:
    | ((context: SpreadsheetGridSlotContext<T>) => ReactNode)
    | undefined,
  context: SpreadsheetGridSlotContext<T>,
  fallback: ReactNode,
) => {
  if (slotRenderer) {
    return slotRenderer(context);
  }
  return fallback;
};

// 追加: ActiveCell を A1 形式へ整形します。
export const formatGridCellLabel = (cell: CellCoord | null) => {
  if (!cell) {
    return 'なし';
  }
  return `${toExcelColumnName(cell.col)}${cell.row + 1}`;
};

// 追加: selection の概要を短く整形します。
export const formatGridSelectionLabel = (selection: GridSelection) => {
  if (!selection) {
    return 'なし';
  }

  if (selection.type === 'cell') {
    const startRow = Math.min(
      selection.range.start.row,
      selection.range.end.row,
    );
    const endRow = Math.max(
      selection.range.start.row,
      selection.range.end.row,
    );
    const startCol = Math.min(
      selection.range.start.col,
      selection.range.end.col,
    );
    const endCol = Math.max(
      selection.range.start.col,
      selection.range.end.col,
    );

    return `${toExcelColumnName(startCol)}${startRow + 1} - ${toExcelColumnName(
      endCol,
    )}${endRow + 1}`;
  }

  if (selection.type === 'row') {
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    return `Row ${startRow + 1} - ${endRow + 1}`;
  }

  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);
  return `Col ${toExcelColumnName(startCol)} - ${toExcelColumnName(endCol)}`;
};

// 追加: rows / filteredRows の概要テキストです。
export const formatGridRowSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'rows' | 'filteredRows'>,
) => `Rows: ${context.filteredRows.length} / ${context.rows.length}`;

// 追加: columns / visibleColumns の概要テキストです。
export const formatGridColumnSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'columns' | 'visibleColumns'>,
) => `Columns: ${context.visibleColumns.length} / ${context.columns.length}`;

// 追加: selection から選択セル数 / 行数 / 列数を算出します。
export const getGridSelectionStats = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    'selection' | 'visibleColumns' | 'filteredRows'
  >,
) => {
  const selection = context.selection;
  if (!selection) {
    return {
      selectedCellCount: 0,
      selectedRowCount: 0,
      selectedColumnCount: 0,
    };
  }

  if (selection.type === 'cell') {
    const startRow = Math.min(
      selection.range.start.row,
      selection.range.end.row,
    );
    const endRow = Math.max(
      selection.range.start.row,
      selection.range.end.row,
    );
    const startCol = Math.min(
      selection.range.start.col,
      selection.range.end.col,
    );
    const endCol = Math.max(
      selection.range.start.col,
      selection.range.end.col,
    );
    const selectedRowCount = endRow - startRow + 1;
    const selectedColumnCount = endCol - startCol + 1;
    return {
      selectedCellCount: selectedRowCount * selectedColumnCount,
      selectedRowCount,
      selectedColumnCount,
    };
  }

  if (selection.type === 'row') {
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    const selectedRowCount = endRow - startRow + 1;
    const selectedColumnCount = context.visibleColumns.length;
    return {
      selectedCellCount: selectedRowCount * selectedColumnCount,
      selectedRowCount,
      selectedColumnCount,
    };
  }

  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);
  const selectedColumnCount = endCol - startCol + 1;
  const selectedRowCount = context.filteredRows.length;
  return {
    selectedCellCount: selectedRowCount * selectedColumnCount,
    selectedRowCount,
    selectedColumnCount,
  };
};

// 追加: selection 数量の要約テキストです。
export const formatGridSelectionStatsLabel = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    'selection' | 'visibleColumns' | 'filteredRows'
  >,
) => {
  const stats = getGridSelectionStats(context);
  return `Cells: ${stats.selectedCellCount} / Rows: ${stats.selectedRowCount}`;
};

// 追加: 列フィルターの有効件数を数えます。
const countActiveColumnFilters = (columnFilterValues: Record<string, unknown>) =>
  Object.values(columnFilterValues).filter(
    (value) => String(value ?? '').trim().length > 0,
  ).length;

// 追加: フィルター状態の要約テキストです。
export const formatGridFilterSummary = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    'globalFilterText' | 'columnFilterValues'
  >,
) => {
  const hasGlobalFilter = context.globalFilterText.trim().length > 0;
  const columnFilterCount = countActiveColumnFilters(context.columnFilterValues);

  if (!hasGlobalFilter && columnFilterCount === 0) {
    return 'Filter: なし';
  }

  if (hasGlobalFilter && columnFilterCount === 0) {
    return 'Filter: Global';
  }

  if (!hasGlobalFilter && columnFilterCount > 0) {
    return `Filter: ${columnFilterCount}列`;
  }

  return `Filter: Global + ${columnFilterCount}列`;
};

// 追加: ソート列の表示名を取得します。
const getSortColumnLabel = <T,>(
  columns: GridColumn<T>[],
  sortState: GridSortState,
) => {
  if (!sortState.columnKey) {
    return '';
  }

  const column = columns.find((item) => item.key === sortState.columnKey);
  return column?.title || column?.key || sortState.columnKey;
};

// 追加: ソート状態の要約テキストです。
export const formatGridSortSummary = <T,>(
  context: Pick<SpreadsheetGridSlotContext<T>, 'columns' | 'sortState'>,
) => {
  if (!context.sortState.columnKey || !context.sortState.direction) {
    return 'Sort: なし';
  }

  const columnLabel = getSortColumnLabel(context.columns, context.sortState);
  const directionLabel =
    context.sortState.direction === 'asc' ? '昇順' : '降順';

  return `Sort: ${columnLabel} (${directionLabel})`;
};