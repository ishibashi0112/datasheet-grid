import {
  useEffect,
  useMemo,
  useReducer,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { gridActions } from './model/gridActions';
import { createInitialGridUiState, gridUiReducer } from './model/gridReducer';
import {
  selectColumnWidth,
  selectGlobalFilter,
  selectIsActiveCell,
  selectIsCellSelected,
  selectIsEditingCell,
} from './model/gridSelectors';
import type {
  CellCoord,
  GridColumn,
  SpreadsheetGridProps,
} from './model/gridTypes';
import { toExcelColumnName } from './utils/excelColumnName';
import { getCellValue, isCellEditable } from './utils/permissions';

// 追加: 行フィルターの最小実装です。初版では global filter のみをここで扱います。
const applyGlobalFilter = <T,>(
  rows: T[],
  columns: GridColumn<T>[],
  globalText: string,
) => {
  const normalizedFilter = globalText.trim().toLowerCase();

  if (!normalizedFilter) {
    return rows;
  }

  return rows.filter((row) =>
    columns.some((column) => {
      const value = getCellValue(row, column);
      return String(value ?? '').toLowerCase().includes(normalizedFilter);
    }),
  );
};

// 追加: Grid 本体です。バッチ1では reducer + 基本描画 + 選択を実装します。
export function SpreadsheetGrid<T>({
  rows,
  columns,
  onRowsChange,
  rowHeight = 36,
  headerHeight = 40,
  rowHeaderWidth = 56,
  readOnly = false,
  canEditCell,
  enableRangeSelection = true,
  enableGlobalFilter = true,
  className,
}: SpreadsheetGridProps<T>) {
  // 追加: visible column だけを描画対象にします。
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible !== false),
    [columns],
  );

  // 追加: reducer 初期化です。列幅などをここで初期化します。
  const [uiState, dispatch] = useReducer(
    gridUiReducer,
    visibleColumns,
    createInitialGridUiState,
  );

  // 追加: columns が変わった際に column width map を同期します。
  useEffect(() => {
    const nextWidths = visibleColumns.reduce<Record<string, number>>(
      (acc, column) => {
        acc[column.key] = column.width;
        return acc;
      },
      {},
    );

    dispatch(gridActions.syncColumnWidths(nextWidths));
  }, [visibleColumns]);

  // 追加: selection drag 中に pointerup で終了できるようにします。
  useEffect(() => {
    const handleWindowPointerUp = () => {
      dispatch(gridActions.endSelection());
    };

    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, []);

  // 追加: グローバルフィルター適用済み rows です。
  const filteredRows = useMemo(
    () => applyGlobalFilter(rows, visibleColumns, selectGlobalFilter(uiState)),
    [rows, visibleColumns, uiState],
  );

  // 追加: 列幅合計を計算して body の横幅に使います。
  const totalColumnWidth = useMemo(
    () =>
      visibleColumns.reduce(
        (sum, column) => sum + selectColumnWidth(uiState, column.key),
        0,
      ),
    [uiState, visibleColumns],
  );

  // 追加: セルクリック/ドラッグ開始時の処理です。
  const handleCellPointerDown = (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    // 追加: 左クリック/主ポインターのみを対象にします。
    if (event.button !== 0) {
      return;
    }

    dispatch(gridActions.activateCell(cell));

    if (enableRangeSelection) {
      dispatch(gridActions.startSelection(cell));
    }
  };

  // 追加: selection drag 中にセルへ入ったら範囲更新します。
  const handleCellPointerEnter = (cell: CellCoord) => {
    if (!enableRangeSelection) {
      return;
    }

    if (uiState.dragState?.type !== 'selection') {
      return;
    }

    dispatch(gridActions.updateSelection(cell));
  };

  // 追加: 列定義に応じて cell node を描画します。
  const renderCellContent = (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
  ) => {
    const value = getCellValue(row, column);
    const readOnlyCell = !isCellEditable(
      { readOnly, canEditCell },
      rowIndex,
      colIndex,
      row,
      column,
    );
    const isActive = selectIsActiveCell(uiState, rowIndex, colIndex);
    const isSelected = selectIsCellSelected(uiState, rowIndex, colIndex);
    const isEditing = selectIsEditingCell(uiState, rowIndex, colIndex);

    if (column.renderCell) {
      return column.renderCell({
        row,
        rowIndex,
        colIndex,
        value,
        column,
        isActive,
        isSelected,
        isEditing,
        readOnly: readOnlyCell,
        // 追加: 実編集は次バッチですが、将来の API 互換のため setValue を先に定義します。
        setValue: (nextValue) => {
          if (!onRowsChange) {
            return;
          }

          const nextRows = rows.map((currentRow, index) =>
            index === rowIndex
              ? ({
                  ...(currentRow as Record<string, unknown>),
                  [column.key]: nextValue,
                } as T)
              : currentRow,
          );

          onRowsChange(nextRows);
        },
      });
    }

    return <span>{String(value ?? '')}</span>;
  };

  // 追加: 共通スタイル定義です。バッチ1では依存を増やさずインラインで最小化します。
  const gridShellStyle: CSSProperties = {
    border: '1px solid #d7dce3',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
  };

  const headerCellBaseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    boxSizing: 'border-box',
    padding: '0 10px',
    borderRight: '1px solid #e5e7eb',
    borderBottom: '1px solid #d7dce3',
    backgroundColor: '#f8fafc',
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
  };

  const rowHeaderCellStyle: CSSProperties = {
    ...headerCellBaseStyle,
    justifyContent: 'center',
    width: rowHeaderWidth,
    minWidth: rowHeaderWidth,
    position: 'sticky',
    left: 0,
    zIndex: 1,
  };

  return (
    <div className={className}>
      {enableGlobalFilter ? (
        <div style={{ marginBottom: 12 }}>
          {/* 追加: 初版の最小 global filter 入力です。 */}
          <input
            type="text"
            value={selectGlobalFilter(uiState)}
            onChange={(event) =>
              dispatch(gridActions.setGlobalFilter(event.target.value))
            }
            placeholder="グローバルフィルター"
            style={{
              width: '100%',
              maxWidth: 320,
              boxSizing: 'border-box',
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
            }}
          />
        </div>
      ) : null}

      <div style={gridShellStyle}>
        <div style={{ overflow: 'auto' }}>
          <div
            style={{
              minWidth: rowHeaderWidth + totalColumnWidth,
            }}
          >
            {/* 追加: ヘッダー行です。左上コーナー + 列ヘッダーを描画します。 */}
            <div style={{ display: 'flex', height: headerHeight }}>
              <div style={rowHeaderCellStyle}>#</div>

              {visibleColumns.map((column, colIndex) => {
                const width = selectColumnWidth(uiState, column.key);

                return (
                  <div
                    key={column.key}
                    style={{
                      ...headerCellBaseStyle,
                      width,
                      minWidth: width,
                      height: headerHeight,
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
                        backgroundColor: '#e2e8f0',
                        color: '#475569',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {toExcelColumnName(colIndex)}
                    </span>

                    {column.renderHeader
                      ? column.renderHeader({
                          colIndex,
                          width,
                          column,
                          filterValue: uiState.filters.columnFilters[column.key],
                          isFiltered:
                            uiState.filters.columnFilters[column.key] !== undefined,
                        })
                      : column.title || column.key}
                  </div>
                );
              })}
            </div>

            {/* 追加: ボディ部です。バッチ1では非仮想の最小描画に留めます。 */}
            {filteredRows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'flex', minHeight: rowHeight }}>
                <div
                  style={{
                    ...rowHeaderCellStyle,
                    height: rowHeight,
                    backgroundColor: '#f8fafc',
                    fontWeight: 500,
                  }}
                >
                  {rowIndex + 1}
                </div>

                {visibleColumns.map((column, colIndex) => {
                  const width = selectColumnWidth(uiState, column.key);
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
                      key={`${rowIndex}-${column.key}`}
                      onPointerDown={(event) =>
                        handleCellPointerDown({ row: rowIndex, col: colIndex }, event)
                      }
                      onPointerEnter={() =>
                        handleCellPointerEnter({ row: rowIndex, col: colIndex })
                      }
                      style={{
                        width,
                        minWidth: width,
                        height: rowHeight,
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 10px',
                        borderRight: '1px solid #e5e7eb',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: isActive
                          ? '#dbeafe'
                          : isSelected
                            ? '#eff6ff'
                            : readOnlyCell
                              ? '#f8fafc'
                              : '#ffffff',
                        color: readOnlyCell ? '#64748b' : '#0f172a',
                        cursor: 'default',
                        userSelect: 'none',
                        outline: isActive ? '2px solid #2563eb' : 'none',
                        outlineOffset: '-2px',
                      }}
                    >
                      {renderCellContent(row, rowIndex, column, colIndex)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpreadsheetGrid;
