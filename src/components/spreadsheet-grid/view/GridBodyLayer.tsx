import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import {
  selectIsActiveCell,
  selectIsCellSelected,
  selectIsRowSelected,
} from '../model/gridSelectors';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  GridUiState,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import type { ColumnMeasurement } from '../logic/geometry';
import { isCellEditable } from '../utils/permissions';

type VirtualRowLike = {
  index: number;
  start: number;
};

type VirtualColumnLike = {
  index: number;
};

type GridBodyLayerProps<T> = {
  filteredRows: T[];
  filteredRowKeys: GridRowKey[];
  visibleColumns: GridColumn<T>[];
  virtualRows: VirtualRowLike[];
  virtualColumns: VirtualColumnLike[];
  virtualRowIndexes: Set<number>;
  virtualColumnIndexes: Set<number>;
  columnMeasurements: ColumnMeasurement<T>[];
  rowHeaderWidth: number;
  headerHeight: number;
  rowHeight: number;
  rowHeaderCellStyle: CSSProperties;
  hoveredRowIndex: number | null;
  isWholeGridSelected: boolean;
  uiState: GridUiState;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  onRowHeaderPointerDown: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerEnter: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellPointerEnter: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellDoubleClick: (cell: CellCoord) => void;
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
  ) => ReactNode;
};

// 追加: 仮想行 / 仮想列に基づいて、行ヘッダーとセル本体を描画する body layer です。
export function GridBodyLayer<T>({
  filteredRows,
  filteredRowKeys,
  visibleColumns,
  virtualRows,
  virtualColumns,
  virtualRowIndexes,
  virtualColumnIndexes,
  columnMeasurements,
  rowHeaderWidth,
  headerHeight,
  rowHeight,
  rowHeaderCellStyle,
  hoveredRowIndex,
  isWholeGridSelected,
  uiState,
  readOnly,
  canEditCell,
  onRowHeaderPointerDown,
  onRowHeaderPointerEnter,
  onRowHeaderPointerLeave,
  onCellPointerDown,
  onCellPointerEnter,
  onCellDoubleClick,
  renderCellContent,
}: GridBodyLayerProps<T>) {
  return (
    <>
      {virtualRows.map((virtualRow) => {
        const rowIndex = virtualRow.index;
        const row = filteredRows[rowIndex];
        const rowKey = filteredRowKeys[rowIndex] ?? rowIndex;
        if (!row || !virtualRowIndexes.has(rowIndex)) {
          return null;
        }

        return (
          <div
            key={String(rowKey)}
            style={{ display: 'flex', minHeight: rowHeight }}
          >
            <div
              onPointerDown={(event) => onRowHeaderPointerDown(rowIndex, event)}
              onPointerEnter={(event) => onRowHeaderPointerEnter(rowIndex, event)}
              onPointerLeave={() => onRowHeaderPointerLeave(rowIndex)}
              style={{
                ...rowHeaderCellStyle,
                position: 'absolute',
                top: headerHeight + virtualRow.start,
                left: 0,
                zIndex: 5,
                height: rowHeight,
                backgroundColor: isWholeGridSelected
                  ? hoveredRowIndex === rowIndex
                    ? '#bfdbfe'
                    : '#dbeafe'
                  : selectIsRowSelected(uiState, rowIndex)
                    ? hoveredRowIndex === rowIndex
                      ? '#bfdbfe'
                      : '#dbeafe'
                    : hoveredRowIndex === rowIndex
                      ? '#e2e8f0'
                      : '#f8fafc',
                fontWeight: 500,
              }}
            >
              {rowIndex + 1}
            </div>

            {virtualColumns.map((virtualColumn) => {
              const colIndex = virtualColumn.index;
              const measurement = columnMeasurements[colIndex];
              const column = visibleColumns[colIndex];
              if (
                !column ||
                !measurement ||
                !virtualColumnIndexes.has(colIndex)
              ) {
                return null;
              }

              const isActive = selectIsActiveCell(uiState, rowIndex, colIndex);
              const isSelected = selectIsCellSelected(uiState, rowIndex, colIndex);
              const readOnlyCell = !isCellEditable(
                { readOnly, canEditCell },
                rowIndex,
                colIndex,
                row,
                column,
              );

              return (
                <div
                  key={`${String(rowKey)}-${column.key}`}
                  onPointerDown={(event) =>
                    onCellPointerDown({ row: rowIndex, col: colIndex }, event)
                  }
                  onPointerEnter={(event) =>
                    onCellPointerEnter({ row: rowIndex, col: colIndex }, event)
                  }
                  onDoubleClick={() =>
                    onCellDoubleClick({ row: rowIndex, col: colIndex })
                  }
                  style={{
                    position: 'absolute',
                    top: headerHeight + virtualRow.start,
                    left: rowHeaderWidth + measurement.start,
                    width: measurement.size,
                    minWidth: measurement.size,
                    height: rowHeight,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    borderRight: '1px solid #e5e7eb',
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: isSelected
                      ? '#ffffff'
                      : readOnlyCell
                        ? '#f8fafc'
                        : '#ffffff',
                    color: readOnlyCell ? '#64748b' : '#0f172a',
                    cursor: 'default',
                    userSelect: 'none',
                    outline: 'none',
                    zIndex: isActive ? 3 : 1,
                  }}
                >
                  {renderCellContent(row, rowIndex, column, colIndex)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export default GridBodyLayer;
