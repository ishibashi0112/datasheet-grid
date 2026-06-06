import type { CSSProperties, PointerEvent } from 'react';
import { selectIsColumnSelected } from '../model/gridSelectors';
import type {
  GridColumn,
  GridSortState,
  GridUiState,
} from '../model/gridTypes';
import type { ColumnMeasurement } from '../logic/geometry';
import { toExcelColumnName } from '../utils/excelColumnName';

type VirtualColumnLike = {
  index: number;
};

type GridHeaderRowProps<T> = {
  rowHeaderWidth: number;
  headerHeight: number;
  rowHeaderCellStyle: CSSProperties;
  headerCellBaseStyle: CSSProperties;
  isCornerHovered: boolean;
  isWholeGridSelected: boolean;
  filteredRowsLength: number;
  visibleColumnsLength: number;
  virtualColumns: VirtualColumnLike[];
  virtualColumnIndexes: Set<number>;
  columnMeasurements: ColumnMeasurement<T>[];
  visibleColumns: GridColumn<T>[];
  hoveredColumnIndex: number | null;
  uiState: GridUiState;
  columnFilterValues: Record<string, unknown>;
  sortState: GridSortState;
  getHeaderActionButtonStyle: (isActive: boolean) => CSSProperties;
  getSortIndicator: (columnKey: string) => string;
  onCornerPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onCornerPointerEnter: () => void;
  onCornerPointerLeave: () => void;
  onColumnHeaderPointerDown: (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onColumnHeaderPointerEnter: (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onColumnHeaderPointerLeave: (colIndex: number) => void;
  onColumnSortButtonPointerDown: (
    columnKey: string,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onColumnFilterButtonPointerDown: (
    column: GridColumn<T>,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onColumnResizePointerDown: (
    column: GridColumn<T>,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
};

// 追加: sticky header 行（左上コーナーセル + 列ヘッダー群）を描画します。
export function GridHeaderRow<T>({
  rowHeaderWidth,
  headerHeight,
  rowHeaderCellStyle,
  headerCellBaseStyle,
  isCornerHovered,
  isWholeGridSelected,
  filteredRowsLength,
  visibleColumnsLength,
  virtualColumns,
  virtualColumnIndexes,
  columnMeasurements,
  visibleColumns,
  hoveredColumnIndex,
  uiState,
  columnFilterValues,
  sortState,
  getHeaderActionButtonStyle,
  getSortIndicator,
  onCornerPointerDown,
  onCornerPointerEnter,
  onCornerPointerLeave,
  onColumnHeaderPointerDown,
  onColumnHeaderPointerEnter,
  onColumnHeaderPointerLeave,
  onColumnSortButtonPointerDown,
  onColumnFilterButtonPointerDown,
  onColumnResizePointerDown,
}: GridHeaderRowProps<T>) {
  return (
    <div
      style={{
        height: headerHeight,
        position: 'sticky',
        top: 0,
        zIndex: 6,
        backgroundColor: '#f8fafc',
      }}
    >
      <div
        onPointerDown={onCornerPointerDown}
        onPointerEnter={onCornerPointerEnter}
        onPointerLeave={onCornerPointerLeave}
        style={{
          ...rowHeaderCellStyle,
          // 追加: 左上コーナーセル専用に見た目を明示して、
          //       高さ・中央寄せ・境界線のズレを抑えます。
          position: 'absolute',
          top: 0,
          left: 0,
          width: rowHeaderWidth,
          minWidth: rowHeaderWidth,
          height: headerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          padding: 0,
          lineHeight: 1,
          zIndex: 7,
          backgroundColor: isWholeGridSelected
            ? isCornerHovered
              ? '#bfdbfe'
              : '#dbeafe'
            : isCornerHovered
              ? '#e2e8f0'
              : '#f8fafc',
          borderRight: '1px solid #e5e7eb',
          borderBottom: '1px solid #d7dce3',
          cursor:
            filteredRowsLength > 0 && visibleColumnsLength > 0
              ? 'pointer'
              : 'default',
        }}
      >
        #
      </div>

      {virtualColumns.map((virtualColumn) => {
        const colIndex = virtualColumn.index;
        const measurement = columnMeasurements[colIndex];
        const column = visibleColumns[colIndex];
        if (!column || !measurement || !virtualColumnIndexes.has(colIndex)) {
          return null;
        }

        const isColumnFiltered =
          String(columnFilterValues[column.key] ?? '').trim().length > 0;
        const isColumnSelected = selectIsColumnSelected(uiState, colIndex);

        return (
          <div
            key={column.key}
            onPointerDown={(event) => onColumnHeaderPointerDown(colIndex, event)}
            onPointerEnter={(event) => onColumnHeaderPointerEnter(colIndex, event)}
            onPointerLeave={() => onColumnHeaderPointerLeave(colIndex)}
            style={{
              position: 'absolute',
              top: 0,
              left: rowHeaderWidth + measurement.start,
              ...headerCellBaseStyle,
              width: measurement.size,
              minWidth: measurement.size,
              height: headerHeight,
              backgroundColor: isWholeGridSelected
                ? hoveredColumnIndex === colIndex
                  ? '#bfdbfe'
                  : '#dbeafe'
                : isColumnSelected
                  ? hoveredColumnIndex === colIndex
                    ? '#bfdbfe'
                    : '#dbeafe'
                  : hoveredColumnIndex === colIndex
                    ? '#e2e8f0'
                    : '#f8fafc',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                borderRadius: 9999,
                backgroundColor: isColumnFiltered ? '#bfdbfe' : '#e2e8f0',
                color: isColumnFiltered ? '#1d4ed8' : '#475569',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {toExcelColumnName(colIndex)}
            </span>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                flex: 1,
                gap: 6,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                  color: isColumnFiltered ? '#1d4ed8' : '#334155',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {column.renderHeader
                  ? column.renderHeader({
                      colIndex,
                      width: measurement.size,
                      column,
                      filterValue: columnFilterValues[column.key],
                      isFiltered: isColumnFiltered,
                    })
                  : column.title || column.key}
              </div>

              <button
                type="button"
                onPointerDown={(event) =>
                  onColumnSortButtonPointerDown(column.key, event)
                }
                title="並び替え"
                style={getHeaderActionButtonStyle(
                  sortState.columnKey === column.key &&
                    sortState.direction !== null,
                )}
              >
                {getSortIndicator(column.key)}
              </button>

              <button
                type="button"
                onPointerDown={(event) =>
                  onColumnFilterButtonPointerDown(column, event)
                }
                title="列フィルター"
                style={getHeaderActionButtonStyle(isColumnFiltered)}
              >
                {isColumnFiltered ? '●' : '○'}
              </button>
            </div>

            <div
              onPointerDown={(event) =>
                onColumnResizePointerDown(column, event)
              }
              style={{
                position: 'absolute',
                top: 0,
                right: -3,
                width: 6,
                height: '100%',
                cursor: 'col-resize',
                zIndex: 3,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default GridHeaderRow;