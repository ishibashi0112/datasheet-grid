import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { gridActions } from './model/gridActions';
import { createInitialGridUiState, gridUiReducer } from './model/gridReducer';
import {
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
  selectColumnWidth,
  selectGlobalFilter,
  selectIsActiveCell,
  selectIsCellSelected,
  selectIsColumnSelected,
  selectIsEditingCell,
  selectIsRowSelected,
} from './model/gridSelectors';
import SelectionOverlay, {
  type SelectionOverlayRect,
} from './SelectionOverlay';
import ActiveCellOverlay, {
  type ActiveCellOverlayRect,
} from './ActiveCellOverlay';
import CellEditorLayer from './CellEditorLayer';
import type {
  CellCoord,
  GridColumn,
  SpreadsheetGridProps,
} from './model/gridTypes';
import { toExcelColumnName } from './utils/excelColumnName';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import {
  applyClipboardMatrixToRows,
  parseClipboardText,
  serializeSelectionToTsv,
} from './utils/clipboard';

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

// 追加: 指定 index までの列幅合計を求めます。
const getColumnOffset = <T,>(
  columns: GridColumn<T>[],
  columnWidths: Record<string, number>,
  columnIndex: number,
) => {
  let offset = 0;

  for (let index = 0; index < columnIndex; index += 1) {
    const column = columns[index];
    if (!column) {
      continue;
    }

    offset += columnWidths[column.key] ?? column.width;
  }

  return offset;
};

// 追加: 値を min/max に収めるユーティリティです。
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// 追加: 文字キー入力で編集開始する判定です。
const isPrintableKey = (event: KeyboardEvent<HTMLDivElement>) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

// 追加: Grid 本体です。バッチ4では ActiveCellOverlay / CellEditorLayer / keyboard navigation を追加します。
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
  // 追加: Grid ルート参照です。keyboard / paste の起点に使います。
  const gridRootRef = useRef<HTMLDivElement | null>(null);

  // 追加: 編集中の入力値です。editingCell 自体は reducer state を使います。
  const [editorValue, setEditorValue] = useState('');
  const [isCommittingEdit, setIsCommittingEdit] = useState(false);

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

  // 追加: selection drag / column resize drag 中の window pointer イベントを処理します。
  useEffect(() => {
    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      if (uiState.dragState?.type === 'columnResize') {
        dispatch(gridActions.updateColumnResize(event.clientX));
      }
    };

    const handleWindowPointerUp = () => {
      dispatch(gridActions.endSelection());
      dispatch(gridActions.endColumnResize());
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [uiState.dragState]);

  // 追加: グローバルフィルター適用済み rows です。
  const filteredRows = useMemo(
    () => applyGlobalFilter(rows, visibleColumns, selectGlobalFilter(uiState)),
    [rows, visibleColumns, uiState],
  );

  // 追加: filteredRows の元 rows index を保持します。
  const filteredRowSourceIndexes = useMemo(
    () => filteredRows.map((filteredRow) => rows.indexOf(filteredRow)),
    [filteredRows, rows],
  );

  // 追加: active cell の矩形です。overlay 用に使います。
  const activeCellRect = useMemo<ActiveCellOverlayRect | null>(() => {
    if (!uiState.activeCell) {
      return null;
    }

    const { row, col } = uiState.activeCell;
    if (row < 0 || row >= filteredRows.length || col < 0 || col >= visibleColumns.length) {
      return null;
    }

    const column = visibleColumns[col];
    if (!column) {
      return null;
    }

    const left = getColumnOffset(visibleColumns, uiState.columnWidths, col);
    const top = row * rowHeight;
    const width = selectColumnWidth(uiState, column.key);

    return {
      left,
      top,
      width,
      height: rowHeight,
    };
  }, [uiState.activeCell, filteredRows.length, visibleColumns, uiState.columnWidths, rowHeight]);

  // 追加: editor layer は editingCell がある場合に activeCellRect を流用します。
  const editorRect = useMemo(
    () => (uiState.editingCell ? activeCellRect : null),
    [uiState.editingCell, activeCellRect],
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

  // 追加: 現在の selection を overlay 用矩形へ変換します。
  const selectionOverlayRect = useMemo<SelectionOverlayRect | null>(() => {
    if (!uiState.selection) {
      return null;
    }

    if (uiState.selection.type === 'cell') {
      const normalizedRange = normalizeCellRange(uiState.selection.range);
      const left = getColumnOffset(
        visibleColumns,
        uiState.columnWidths,
        normalizedRange.start.col,
      );
      const top = normalizedRange.start.row * rowHeight;
      const width =
        getColumnOffset(
          visibleColumns,
          uiState.columnWidths,
          normalizedRange.end.col + 1,
        ) - left;
      const height =
        (normalizedRange.end.row - normalizedRange.start.row + 1) * rowHeight;

      return { left, top, width, height };
    }

    if (uiState.selection.type === 'row') {
      const normalizedRange = normalizeRowRange(
        uiState.selection.startRow,
        uiState.selection.endRow,
      );

      return {
        left: 0,
        top: normalizedRange.startRow * rowHeight,
        width: totalColumnWidth,
        height:
          (normalizedRange.endRow - normalizedRange.startRow + 1) * rowHeight,
      };
    }

    const normalizedRange = normalizeColumnRange(
      uiState.selection.startCol,
      uiState.selection.endCol,
    );
    const left = getColumnOffset(
      visibleColumns,
      uiState.columnWidths,
      normalizedRange.startCol,
    );
    const width =
      getColumnOffset(
        visibleColumns,
        uiState.columnWidths,
        normalizedRange.endCol + 1,
      ) - left;

    return {
      left,
      top: 0,
      width,
      height: filteredRows.length * rowHeight,
    };
  }, [
    uiState.selection,
    uiState.columnWidths,
    visibleColumns,
    rowHeight,
    filteredRows.length,
    totalColumnWidth,
  ]);

  // 追加: セルクリック/ドラッグ開始時の処理です。
  const handleCellPointerDown = (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    // 追加: 左クリック/主ポインターのみを対象にします。
    if (event.button !== 0) {
      return;
    }

    gridRootRef.current?.focus();

    dispatch(gridActions.activateCell(cell));

    if (enableRangeSelection) {
      dispatch(gridActions.startSelection(cell));
    }
  };

  // 追加: ダブルクリック時に編集開始します。
  const handleCellDoubleClick = (cell: CellCoord) => {
    const row = filteredRows[cell.row];
    const column = visibleColumns[cell.col];

    if (!row || !column) {
      return;
    }

    if (
      !isCellEditable(
        { readOnly, canEditCell },
        cell.row,
        cell.col,
        row,
        column,
      )
    ) {
      return;
    }

    const currentValue = getCellValue(row, column);
    setEditorValue(String(currentValue ?? ''));
    dispatch(gridActions.startEdit(cell));
  };

  // 追加: 編集確定です。editorValue を rows へ反映します。
  const commitEdit = () => {
    if (!uiState.editingCell) {
      return;
    }

    const editingCell = uiState.editingCell;
    const column = visibleColumns[editingCell.col];
    const originalRowIndex =
      filteredRowSourceIndexes[editingCell.row] ?? editingCell.row;
    const row = rows[originalRowIndex];

    if (!column || !row) {
      dispatch(gridActions.stopEdit());
      return;
    }

    setIsCommittingEdit(true);

    if (onRowsChange) {
      const parsedValue = column.parseClipboardValue
        ? column.parseClipboardValue(editorValue, row)
        : editorValue;

      const nextRows = rows.map((currentRow, index) =>
        index === originalRowIndex
          ? setCellValue(currentRow, column, parsedValue)
          : currentRow,
      );

      onRowsChange(nextRows);
    }

    // 追加: 編集確定後に Grid ルートへフォーカスを戻し、
    //       矢印キーなどのキーボード操作を継続できるようにします。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });

    dispatch(gridActions.stopEdit());
    setTimeout(() => setIsCommittingEdit(false), 0);
  };

  // 追加: 編集キャンセルです。editor を閉じるだけです。
  const cancelEdit = () => {
    dispatch(gridActions.stopEdit());

    // 追加: キャンセル時も Grid ルートへフォーカスを戻します。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  };

  // 追加: selection drag 中にセルへ入ったら範囲更新します。
  const handleCellPointerEnter = (cell: CellCoord) => {
    if (!enableRangeSelection) {
      return;
    }

    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'cell'
    ) {
      return;
    }

    dispatch(gridActions.updateSelection(cell));
  };

  // 追加: 行ヘッダー選択開始です。
  const handleRowHeaderPointerDown = (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    gridRootRef.current?.focus();

    dispatch(gridActions.startRowSelection(rowIndex));
  };

  // 追加: 行ヘッダードラッグ中の更新です。
  const handleRowHeaderPointerEnter = (rowIndex: number) => {
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'row'
    ) {
      return;
    }

    dispatch(gridActions.updateRowSelection(rowIndex));
  };

  // 追加: 列ヘッダー選択開始です。
  const handleColumnHeaderPointerDown = (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    gridRootRef.current?.focus();

    dispatch(gridActions.startColumnSelection(colIndex));
  };

  // 追加: 列ヘッダードラッグ中の更新です。
  const handleColumnHeaderPointerEnter = (colIndex: number) => {
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'col'
    ) {
      return;
    }

    dispatch(gridActions.updateColumnSelection(colIndex));
  };

  // 追加: column resize 開始処理です。
  const handleColumnResizePointerDown = (
    column: GridColumn<T>,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    dispatch(
      gridActions.startColumnResize(
        column.key,
        event.clientX,
        selectColumnWidth(uiState, column.key),
        column.minWidth ?? 60,
        column.maxWidth ?? 1000,
      ),
    );
  };

  // 追加: copy 処理です。selection を TSV にしてクリップボードへ書き込みます。
  const handleCopy = async () => {
    const text = serializeSelectionToTsv(
      filteredRows,
      visibleColumns,
      uiState.selection as
        | { type: 'cell'; range: { start: { row: number; col: number }; end: { row: number; col: number } } }
        | { type: 'row'; startRow: number; endRow: number }
        | { type: 'col'; startCol: number; endCol: number }
        | null,
    );

    if (!text) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  // 追加: active cell を移動します。shiftKey=true の場合は cell selection を拡張します。
  const moveActiveCell = (
    deltaRow: number,
    deltaCol: number,
    extendSelection: boolean,
  ) => {
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return;
    }

    const currentCell = uiState.activeCell ?? { row: 0, col: 0 };
    const nextCell = {
      row: clamp(currentCell.row + deltaRow, 0, filteredRows.length - 1),
      col: clamp(currentCell.col + deltaCol, 0, visibleColumns.length - 1),
    };

    if (extendSelection) {
      const anchor =
        uiState.selection?.type === 'cell'
          ? uiState.selection.range.start
          : currentCell;

      dispatch(gridActions.startSelection(anchor));
      dispatch(gridActions.updateSelection(nextCell));
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(nextCell));
      return;
    }

    dispatch(gridActions.startSelection(nextCell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(nextCell));
  };

  // 追加: Ctrl/Cmd + C や Arrow/Enter を捕捉します。
  const handleKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (uiState.editingCell) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await handleCopy();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveCell(-1, 0, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveCell(1, 0, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveActiveCell(0, -1, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveActiveCell(0, 1, event.shiftKey);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      moveActiveCell(0, event.shiftKey ? -1 : 1, false);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch(gridActions.clearSelection());
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();

      if (uiState.activeCell) {
        handleCellDoubleClick(uiState.activeCell);
      }
      return;
    }

    // 追加: 文字キー入力で直接編集開始します。
    if (isPrintableKey(event) && uiState.activeCell) {
      const row = filteredRows[uiState.activeCell.row];
      const column = visibleColumns[uiState.activeCell.col];

      if (!row || !column) {
        return;
      }

      if (
        !isCellEditable(
          { readOnly, canEditCell },
          uiState.activeCell.row,
          uiState.activeCell.col,
          row,
          column,
        )
      ) {
        return;
      }

      event.preventDefault();
      setEditorValue(event.key);
      dispatch(gridActions.startEdit(uiState.activeCell));
    }
  };

  // 追加: paste 処理です。TSV を activeCell 起点に適用します。
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!onRowsChange || !uiState.activeCell) {
      return;
    }

    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }

    event.preventDefault();

    const matrix = parseClipboardText(text);
    const nextRows = applyClipboardMatrixToRows(
      rows,
      filteredRowSourceIndexes,
      visibleColumns,
      matrix,
      uiState.activeCell.row,
      uiState.activeCell.col,
      (originalRowIndex, colIndex, row, column) =>
        isCellEditable(
          { readOnly, canEditCell },
          originalRowIndex,
          colIndex,
          row,
          column,
        ),
    );

    onRowsChange(nextRows);
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
        // 追加: 実編集は CellEditorLayer で行いますが、将来の API 互換のため setValue も残します。
        setValue: (nextValue) => {
          if (!onRowsChange) {
            return;
          }

          const originalRowIndex = filteredRowSourceIndexes[rowIndex] ?? rowIndex;
          const nextRows = rows.map((currentRow, index) =>
            index === originalRowIndex
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

  // 追加: 共通スタイル定義です。バッチ4でも依存を増やさずインラインで最小化します。
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

      <div
        ref={gridRootRef}
        style={gridShellStyle}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      >
        <div style={{ overflow: 'auto' }}>
          <div
            style={{
              position: 'relative',
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
                    onPointerDown={(event) =>
                      handleColumnHeaderPointerDown(colIndex, event)
                    }
                    onPointerEnter={() => handleColumnHeaderPointerEnter(colIndex)}
                    style={{
                      position: 'relative',
                      ...headerCellBaseStyle,
                      width,
                      minWidth: width,
                      height: headerHeight,
                      backgroundColor: selectIsColumnSelected(uiState, colIndex)
                        ? '#dbeafe'
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

                    {/* 追加: 列幅リサイズ用ハンドルです。 */}
                    <div
                      onPointerDown={(event) =>
                        handleColumnResizePointerDown(column, event)
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

            {/* 追加: 選択範囲 overlay です。row/col selection にも対応します。 */}
            <SelectionOverlay
              rect={selectionOverlayRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
            />

            {/* 追加: active cell overlay です。 */}
            <ActiveCellOverlay
              rect={activeCellRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
            />

            {/* 追加: 編集中セルの editor layer です。 */}
            <CellEditorLayer
              rect={editorRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
              value={editorValue}
              onChange={setEditorValue}
              onCommit={commitEdit}
              onCancel={cancelEdit}
            />

            {/* 追加: ボディ部です。バッチ4でも非仮想の描画に留めます。 */}
            {filteredRows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'flex', minHeight: rowHeight }}>
                <div
                  onPointerDown={(event) => handleRowHeaderPointerDown(rowIndex, event)}
                  onPointerEnter={() => handleRowHeaderPointerEnter(rowIndex)}
                  style={{
                    ...rowHeaderCellStyle,
                    height: rowHeight,
                    backgroundColor: selectIsRowSelected(uiState, rowIndex)
                      ? '#dbeafe'
                      : '#f8fafc',
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
                      onDoubleClick={() =>
                        handleCellDoubleClick({ row: rowIndex, col: colIndex })
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
                        backgroundColor: isSelected
                          ? '#ffffff'
                          : readOnlyCell
                            ? '#f8fafc'
                            : '#ffffff',
                        color: readOnlyCell ? '#64748b' : '#0f172a',
                        cursor: 'default',
                        userSelect: 'none',
                        outline: 'none',
                        position: 'relative',
                        zIndex: isActive ? 3 : 1,
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

      {/* 追加: blur 由来の二重 commit を避けるための状態を戻します。 */}
      {isCommittingEdit ? (
        <span style={{ display: 'none' }} aria-hidden="true" />
      ) : null}
    </div>
  );
}

export default SpreadsheetGrid;
