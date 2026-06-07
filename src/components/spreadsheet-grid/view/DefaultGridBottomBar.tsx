import type { CSSProperties } from 'react';
import type {
  CellCoord,
  GridSelection,
  SpreadsheetGridSlotContext,
} from '../model/gridTypes';
import { toExcelColumnName } from '../utils/excelColumnName';

type DefaultGridBottomBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: ActiveCell を A1 形式へ整形します。
const formatCellLabel = (cell: CellCoord | null) => {
  if (!cell) {
    return 'なし';
  }
  return `${toExcelColumnName(cell.col)}${cell.row + 1}`;
};

// 追加: selection の概要を短く整形します。
const formatSelectionLabel = (selection: GridSelection) => {
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

// 追加: Grid 下部の既定ステータスバーです。
export function DefaultGridBottomBar<T>({
  context,
}: DefaultGridBottomBarProps<T>) {
  const wrapperStyle: CSSProperties = {
    marginTop: 12,
  };

  const barStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid #d7dce3',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    fontSize: 12,
    color: '#475569',
    flexWrap: 'wrap',
  };

  const groupStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  };

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    color: '#334155',
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={wrapperStyle}>
      <div style={barStyle}>
        <div style={groupStyle}>
          <span style={chipStyle}>
            Rows: {context.filteredRows.length} / {context.rows.length}
          </span>
          <span style={chipStyle}>
            Columns: {context.visibleColumns.length} / {context.columns.length}
          </span>
        </div>

        <div style={groupStyle}>
          <span style={chipStyle}>
            Active: {formatCellLabel(context.activeCell)}
          </span>
          <span style={chipStyle}>
            Selection: {formatSelectionLabel(context.selection)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DefaultGridBottomBar;