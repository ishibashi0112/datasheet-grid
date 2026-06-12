import type { ReactNode } from 'react';
import type {
  CellCoord,
  GridSelection,
  GridSortState,
  GridColumn,
  SpreadsheetGridSlotContext,
  SpreadsheetGridDerivedSummary,
  SpreadsheetGridSelectionStats,
} from '../model/gridTypes';
import { toExcelColumnName } from '../utils/excelColumnName';
// 追加(12-A): set フィルター対応のフィルター有効判定を共有します。
import { isActiveColumnFilterValue } from '../logic/filtering';

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

// 追加: summary 用に長い文字列を短く丸めます。
const truncateSummaryText = (value: string, maxLength = 16) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
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
): SpreadsheetGridSelectionStats => {
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

// 変更(12-A): 列フィルターの有効件数を数えます。
// 変更理由: set フィルター値はオブジェクトのため String(value).trim() 判定が
//           成立しません(空配列も「全行除外」として有効に数える必要があります)。
//           判定を logic/filtering.ts の isActiveColumnFilterValue へ一元化します。
const countActiveColumnFilters = (columnFilterValues: Record<string, unknown>) =>
  Object.values(columnFilterValues).filter((value) =>
    isActiveColumnFilterValue(value),
  ).length;

// 追加: フィルター状態の要約テキストです。
export const formatGridFilterSummary = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    'globalFilterText' | 'columnFilterValues'
  >,
) => {
  const hasGlobalFilter = context.globalFilterText.trim().length > 0;
  const globalFilterPreview = hasGlobalFilter
    ? truncateSummaryText(context.globalFilterText.trim())
    : null;
  const columnFilterCount = countActiveColumnFilters(context.columnFilterValues);

  if (!hasGlobalFilter && columnFilterCount === 0) {
    return 'Filter: なし';
  }

  if (hasGlobalFilter && columnFilterCount === 0) {
    return `Filter: Global("${globalFilterPreview}")`;
  }

  if (!hasGlobalFilter && columnFilterCount > 0) {
    return `Filter: ${columnFilterCount}列`;
  }

  return `Filter: Global("${globalFilterPreview}") + ${columnFilterCount}列`;
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

// 追加: slot context に載せる派生 summary を一括構築します。
export const buildGridDerivedSummary = <T,>(
  context: Pick<
    SpreadsheetGridSlotContext<T>,
    | 'rows'
    | 'filteredRows'
    | 'columns'
    | 'visibleColumns'
    | 'globalFilterText'
    | 'columnFilterValues'
    | 'sortState'
    | 'activeCell'
    | 'selection'
  >,
): SpreadsheetGridDerivedSummary => {
  const selectionStats = getGridSelectionStats(context);
  const hasGlobalFilter = context.globalFilterText.trim().length > 0;
  const globalFilterPreview = hasGlobalFilter
    ? truncateSummaryText(context.globalFilterText.trim())
    : null;
  const activeColumnFilterCount = countActiveColumnFilters(
    context.columnFilterValues,
  );
  const hasAnyFilter = hasGlobalFilter || activeColumnFilterCount > 0;
  const hasSorting =
    context.sortState.columnKey !== null && context.sortState.direction !== null;
  const sortedColumnLabel = hasSorting
    ? getSortColumnLabel(context.columns, context.sortState)
    : null;

  return {
    rowSummaryText: formatGridRowSummary(context),
    columnSummaryText: formatGridColumnSummary(context),
    filterSummaryText: formatGridFilterSummary(context),
    sortSummaryText: formatGridSortSummary(context),
    activeCellLabel: formatGridCellLabel(context.activeCell),
    selectionLabel: formatGridSelectionLabel(context.selection),
    selectionStatsText: formatGridSelectionStatsLabel(context),
    selectionStats,
    hasGlobalFilter,
    globalFilterPreview,
    activeColumnFilterCount,
    hasAnyFilter,
    hasSorting,
    sortedColumnLabel,
  };
};