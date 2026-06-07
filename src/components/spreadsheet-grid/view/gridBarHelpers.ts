import type { ReactNode } from 'react';
import type {
  CellCoord,
  GridSelection,
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
    const endRow = Math.max(selection.range.start.row, selection.range.end.row);
    const startCol = Math.min(
      selection.range.start.col,
      selection.range.end.col,
    );
    const endCol = Math.max(selection.range.start.col, selection.range.end.col);

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