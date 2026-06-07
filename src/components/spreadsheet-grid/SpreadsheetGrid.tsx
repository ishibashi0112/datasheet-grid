// 追加: 列フィルター UI 整備 + ソート/フィルター見た目強化を反映します。
import {
  useEffect,
  useMemo,
  useCallback,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  selectIsEditingCell,
} from './model/gridSelectors';
import SelectionOverlay, {
  type SelectionOverlayRect,
} from './SelectionOverlay';
import ActiveCellOverlay, {
  type ActiveCellOverlayRect,
} from './ActiveCellOverlay';
import CellEditorLayer from './CellEditorLayer';
import { useFilterPopoverController } from './hooks/useFilterPopoverController';
import { useGridClipboardController } from './hooks/useGridClipboardController';
import { useGridEditController } from './hooks/useGridEditController';
import { useGridKeyboardInteractions } from './hooks/useGridKeyboardInteractions';
import { useGridPointerInteractions } from './hooks/useGridPointerInteractions';
import { useGridViewportSync } from './hooks/useGridViewportSync';
import {
  applyColumnFilters,
  applyGlobalFilter,
  type GridRowModelLike,
} from './logic/filtering';
import { buildColumnMeasurements } from './logic/geometry';
import { applySort } from './logic/sorting';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  SpreadsheetGridProps,
  SpreadsheetGridSlotContext,
} from './model/gridTypes';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import ColumnFilterPopover from './view/ColumnFilterPopover';
import DefaultGridBottomBar from './view/DefaultGridBottomBar';
import DefaultGridTopBar from './view/DefaultGridTopBar';
import { resolveGridSlot } from './view/gridBarHelpers';
import GridBodyLayer from './view/GridBodyLayer';
import GridHeaderRow from './view/GridHeaderRow';

// 追加: 元 rows と filteredRows の対応を安定して持つための row model です。
type SourceRowModel<T> = GridRowModelLike<T> & {
  rowKey: GridRowKey;
};

// 追加: Grid 本体です。
export function SpreadsheetGrid<T extends object>({
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  rowKeyGetter,
  createRow,
  createOverflowColumn,
  rowHeight = 36,
  headerHeight = 40,
  rowHeaderWidth = 56,
  readOnly = false,
  canEditCell,
  enableRangeSelection = true,
  enableGlobalFilter = true,
  enableColumnFilter = true,
  enableSorting = true,
  renderTopBar,
  renderBottomBar,
  className,
}: SpreadsheetGridProps<T>) {
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const editorActionGuardRef = useRef(false);

  const [editorValue, setEditorValue] = useState('');
  const [isCornerHovered, setIsCornerHovered] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(
    null,
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible !== false),
    [columns],
  );

  const resolvedRowKeyGetter = useMemo(
    () => rowKeyGetter ?? ((_row: T, index: number) => index),
    [rowKeyGetter],
  );

  const [uiState, dispatch] = useReducer(
    gridUiReducer,
    visibleColumns,
    createInitialGridUiState,
  );

  const {
    filterPopoverState,
    filterPopoverLayout,
    filterPopoverRef,
    filterTextInputRef,
    filterSelectRef,
    isFilterPopoverOpen,
    openedFilterColumn,
    openColumnFilterPopover,
    closeColumnFilterPopover,
    updateFilterPopoverDraft,
  } = useFilterPopoverController({
    visibleColumns,
    columnFilterValues: uiState.filters.columnFilters,
    enableColumnFilter,
    gridRootRef,
  });

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

  const sourceRowModels = useMemo<SourceRowModel<T>[]>(
    () =>
      rows.map((row, index) => ({
        row,
        sourceIndex: index,
        rowKey: resolvedRowKeyGetter(row, index),
      })),
    [rows, resolvedRowKeyGetter],
  );

  const getColumnSelectOptions = useCallback(
    (column: GridColumn<T>) => {
      if (column.filterOptions && column.filterOptions.length > 0) {
        return column.filterOptions;
      }

      const seen = new Set<string>();
      const options = sourceRowModels.reduce<{ label: string; value: string }[]>(
        (acc, rowModel) => {
          const value = String(getCellValue(rowModel.row, column) ?? '');
          if (seen.has(value)) {
            return acc;
          }

          seen.add(value);
          acc.push({
            value,
            label: value || '（空白）',
          });
          return acc;
        },
        [],
      );

      return options.sort((left, right) =>
        left.label.localeCompare(right.label, 'ja', {
          numeric: true,
          sensitivity: 'base',
        }),
      );
    },
    [sourceRowModels],
  );

  const globallyFilteredRowModels = useMemo(
    () =>
      applyGlobalFilter(
        sourceRowModels,
        visibleColumns,
        selectGlobalFilter(uiState),
      ),
    [sourceRowModels, visibleColumns, uiState],
  );

  const columnFilteredRowModels = useMemo(
    () =>
      applyColumnFilters(
        globallyFilteredRowModels,
        visibleColumns,
        uiState.filters.columnFilters,
      ),
    [globallyFilteredRowModels, visibleColumns, uiState.filters.columnFilters],
  );

  const filteredRowModels = useMemo(
    () => applySort(columnFilteredRowModels, visibleColumns, uiState.sort),
    [columnFilteredRowModels, visibleColumns, uiState.sort],
  );

  const filteredRows = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.row),
    [filteredRowModels],
  );

  const filteredRowSourceIndexes = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.sourceIndex),
    [filteredRowModels],
  );

  const filteredRowKeys = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.rowKey),
    [filteredRowModels],
  );

  const columnMeasurements = useMemo(
    () => buildColumnMeasurements(visibleColumns, uiState.columnWidths),
    [visibleColumns, uiState.columnWidths],
  );

  const totalColumnWidth = useMemo(
    () =>
      columnMeasurements.length > 0
        ? columnMeasurements[columnMeasurements.length - 1].end
        : 0,
    [columnMeasurements],
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    useFlushSync: false,
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: visibleColumns.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: (index) =>
      columnMeasurements[index]?.size ?? visibleColumns[index]?.width ?? 120,
    overscan: 4,
    useFlushSync: false,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const totalBodyHeight = rowVirtualizer.getTotalSize();

  const virtualRowIndexes = useMemo(
    () => new Set(virtualRows.map((item) => item.index)),
    [virtualRows],
  );

  const virtualColumnIndexes = useMemo(
    () => new Set(virtualColumns.map((item) => item.index)),
    [virtualColumns],
  );

  const activeCellRect = useMemo<ActiveCellOverlayRect | null>(() => {
    if (!uiState.activeCell) {
      return null;
    }

    const { row, col } = uiState.activeCell;
    if (
      row < 0 ||
      row >= filteredRows.length ||
      col < 0 ||
      col >= visibleColumns.length
    ) {
      return null;
    }

    const measurement = columnMeasurements[col];
    if (!measurement) {
      return null;
    }

    const top = row * rowHeight;
    return {
      left: measurement.start,
      top,
      width: measurement.size,
      height: rowHeight,
    };
  }, [
    uiState.activeCell,
    filteredRows.length,
    visibleColumns.length,
    columnMeasurements,
    rowHeight,
  ]);

  const editorRect = useMemo(
    () => (uiState.editingCell ? activeCellRect : null),
    [uiState.editingCell, activeCellRect],
  );

  useGridViewportSync({
    bodyScrollRef,
    rowVirtualizer,
    columnVirtualizer,
    rowHeight,
    filteredRowsLength: filteredRows.length,
    columnMeasurements,
    totalColumnWidth,
    totalBodyHeight,
    rowHeaderWidth,
    headerHeight,
    activeCellRect,
  });

  const {
    updateSelectionFromPointer,
    handleCellPointerDown,
    handleCellPointerEnter,
    handleNativeDragStart,
    handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter,
  } = useGridPointerInteractions({
    gridRootRef,
    bodyScrollRef,
    pointerClientRef,
    autoScrollFrameRef,
    uiState,
    dispatch,
    enableRangeSelection,
    filteredRowsLength: filteredRows.length,
    visibleColumnsLength: visibleColumns.length,
    columnMeasurements,
    rowHeaderWidth,
    headerHeight,
    rowHeight,
  });

  const { isWholeGridSelected, handleCopy, handlePaste } =
    useGridClipboardController({
      rows,
      filteredRows,
      filteredRowSourceIndexes,
      visibleColumns,
      uiState,
      readOnly,
      canEditCell,
      createRow,
      createOverflowColumn,
      onRowsChange,
      onColumnsChange,
      dispatch,
    });

  const selectEntireGrid = useCallback(() => {
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return;
    }

    const startCell = { row: 0, col: 0 };
    const endCell = {
      row: filteredRows.length - 1,
      col: visibleColumns.length - 1,
    };

    dispatch(gridActions.startSelection(startCell));
    dispatch(gridActions.updateSelection(endCell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(startCell));
  }, [dispatch, filteredRows.length, visibleColumns.length]);

  const handleCellDoubleClick = useCallback(
    (cell: CellCoord) => {
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
    },
    [canEditCell, dispatch, filteredRows, readOnly, visibleColumns],
  );

  const { getMovedCell, handleKeyDown } = useGridKeyboardInteractions({
    uiState,
    filteredRows,
    visibleColumns,
    readOnly,
    canEditCell,
    setEditorValue,
    dispatch,
    handleCopy,
    handleCellDoubleClick,
    isWholeGridSelected,
    selectEntireGrid,
  });

  const { startEditWithValue, commitEdit, cancelEdit } = useGridEditController({
    uiState,
    rows,
    visibleColumns,
    filteredRowSourceIndexes,
    editorValue,
    setEditorValue,
    onRowsChange,
    dispatch,
    getMovedCell,
    gridRootRef,
    editorActionGuardRef,
  });

  const handleCellDoubleClickWithController = useCallback(
    (cell: CellCoord) => {
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
      startEditWithValue(cell, String(currentValue ?? ''));
    },
    [canEditCell, filteredRows, readOnly, startEditWithValue, visibleColumns],
  );

  const selectionOverlayRect = useMemo<SelectionOverlayRect | null>(() => {
    if (!uiState.selection) {
      return null;
    }

    if (uiState.selection.type === 'cell') {
      const normalizedRange = normalizeCellRange(uiState.selection.range);
      const startMeasurement = columnMeasurements[normalizedRange.start.col];
      const endMeasurement = columnMeasurements[normalizedRange.end.col];
      if (!startMeasurement || !endMeasurement) {
        return null;
      }

      const top = normalizedRange.start.row * rowHeight;
      const height =
        (normalizedRange.end.row - normalizedRange.start.row + 1) * rowHeight;

      return {
        left: startMeasurement.start,
        top,
        width: endMeasurement.end - startMeasurement.start,
        height,
      };
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
    const startMeasurement = columnMeasurements[normalizedRange.startCol];
    const endMeasurement = columnMeasurements[normalizedRange.endCol];
    if (!startMeasurement || !endMeasurement) {
      return null;
    }

    return {
      left: startMeasurement.start,
      top: 0,
      width: endMeasurement.end - startMeasurement.start,
      height: filteredRows.length * rowHeight,
    };
  }, [
    uiState.selection,
    columnMeasurements,
    rowHeight,
    filteredRows.length,
    totalColumnWidth,
  ]);

  const handleCornerHeaderPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }

      if (filteredRows.length === 0 || visibleColumns.length === 0) {
        return;
      }

      gridRootRef.current?.focus();

      if (isWholeGridSelected) {
        dispatch(gridActions.clearSelection());
        dispatch(gridActions.activateCell(null));
        return;
      }

      selectEntireGrid();
    },
    [
      dispatch,
      filteredRows.length,
      isWholeGridSelected,
      selectEntireGrid,
      visibleColumns.length,
    ],
  );

  const handleColumnResizePointerDown = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      dispatch(
        gridActions.startColumnResize(
          column.key,
          event.clientX,
          selectColumnWidth(uiState, column.key) ?? column.width,
          column.minWidth ?? 60,
          column.maxWidth ?? 1000,
        ),
      );
    },
    [dispatch, uiState],
  );

  const applyFilterPopoverValue = useCallback(() => {
    if (!filterPopoverState) {
      return;
    }

    const targetColumn = visibleColumns.find(
      (column) => column.key === filterPopoverState.columnKey,
    );
    const filterType = targetColumn?.filterType ?? 'text';
    const normalized =
      filterType === 'select'
        ? filterPopoverState.draftValue
        : filterPopoverState.draftValue.trim();

    if (!normalized) {
      dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
      closeColumnFilterPopover();
      return;
    }

    dispatch(
      gridActions.setColumnFilter(filterPopoverState.columnKey, normalized),
    );
    closeColumnFilterPopover();
  }, [closeColumnFilterPopover, dispatch, filterPopoverState, visibleColumns]);

  const clearFilterPopoverValue = useCallback(() => {
    if (!filterPopoverState) {
      return;
    }

    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    closeColumnFilterPopover();
  }, [closeColumnFilterPopover, dispatch, filterPopoverState]);

  const handleColumnSortButtonPointerDown = useCallback(
    (columnKey: string, event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!enableSorting) {
        return;
      }

      if (
        uiState.sort.columnKey !== columnKey ||
        uiState.sort.direction === null
      ) {
        dispatch(gridActions.setSort(columnKey, 'asc'));
        return;
      }

      if (uiState.sort.direction === 'asc') {
        dispatch(gridActions.setSort(columnKey, 'desc'));
        return;
      }

      dispatch(gridActions.clearSort());
    },
    [dispatch, enableSorting, uiState.sort],
  );

  const getSortIndicator = useCallback(
    (columnKey: string) => {
      if (
        !enableSorting ||
        uiState.sort.columnKey !== columnKey ||
        !uiState.sort.direction
      ) {
        return '↕';
      }

      return uiState.sort.direction === 'asc' ? '↑' : '↓';
    },
    [enableSorting, uiState.sort],
  );

  const getHeaderActionButtonStyle = useCallback(
    (isActive: boolean): CSSProperties => ({
      border: '1px solid #cbd5e1',
      backgroundColor: isActive ? '#dbeafe' : '#ffffff',
      color: isActive ? '#2563eb' : '#475569',
      borderRadius: 6,
      width: 24,
      height: 24,
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: 11,
      flex: '0 0 auto',
    }),
    [],
  );

  const renderCellContent = useCallback(
    (
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

            const originalRowIndex =
              filteredRowSourceIndexes[rowIndex] ?? rowIndex;
            const nextRows = rows.map((currentRow, index) =>
              index === originalRowIndex
                ? setCellValue(currentRow, column, nextValue)
                : currentRow,
            );
            onRowsChange(nextRows);
          },
        });
      }

      return <span>{String(value ?? '')}</span>;
    },
    [
      canEditCell,
      filteredRowSourceIndexes,
      onRowsChange,
      readOnly,
      rows,
      uiState,
    ],
  );

  // 追加: topBar / bottomBar 用に global filter setter を公開します。
  const setGlobalFilterText = useCallback(
    (value: string) => {
      dispatch(gridActions.setGlobalFilter(value));
    },
    [dispatch],
  );

  // 追加: slot に公開する最小コンテキストです。
  const slotContext = useMemo<SpreadsheetGridSlotContext<T>>(
    () => ({
      rows,
      filteredRows,
      columns,
      visibleColumns,
      globalFilterText: selectGlobalFilter(uiState),
      // 追加: bar summary 用に列フィルター値を公開します。
      columnFilterValues: uiState.filters.columnFilters,
      // 追加: bar summary 用にソート状態を公開します。
      sortState: uiState.sort,
      setGlobalFilterText,
      activeCell: uiState.activeCell,
      selection: uiState.selection,
    }),
    [
      rows,
      filteredRows,
      columns,
      visibleColumns,
      uiState,
      setGlobalFilterText,
    ],
  );

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

  const renderedFilterPopover = openedFilterColumn ? (
    <ColumnFilterPopover
      isOpen={Boolean(filterPopoverState)}
      title={openedFilterColumn.title || openedFilterColumn.key}
      filterType={openedFilterColumn.filterType ?? 'text'}
      draftValue={filterPopoverState?.draftValue ?? ''}
      currentValueText={
        String(uiState.filters.columnFilters[openedFilterColumn.key] ?? '').trim()
          ? String(uiState.filters.columnFilters[openedFilterColumn.key])
          : '（なし）'
      }
      layout={filterPopoverLayout}
      selectOptions={getColumnSelectOptions(openedFilterColumn)}
      popoverRef={filterPopoverRef}
      textInputRef={filterTextInputRef}
      selectRef={filterSelectRef}
      onRequestClose={closeColumnFilterPopover}
      onDraftChange={updateFilterPopoverDraft}
      onApply={applyFilterPopoverValue}
      onClear={clearFilterPopoverValue}
    />
  ) : null;

  // 追加: slot helper を使って top/bottom の描画を解決します。
  const resolvedTopBar = resolveGridSlot(
    renderTopBar,
    slotContext,
    enableGlobalFilter ? <DefaultGridTopBar context={slotContext} /> : null,
  );

  // 追加: bottom は未指定時に既定ステータスバーを表示します。
  const resolvedBottomBar = resolveGridSlot(
    renderBottomBar,
    slotContext,
    <DefaultGridBottomBar context={slotContext} />,
  );

  return (
    <div className={className}>
      {resolvedTopBar}

      <div
        ref={gridRootRef}
        style={gridShellStyle}
        onDragStart={handleNativeDragStart}
        onPointerMoveCapture={(event) => {
          pointerClientRef.current = { x: event.clientX, y: event.clientY };
          updateSelectionFromPointer(event.clientX, event.clientY);
        }}
        // 追加: popover open 中は grid root を tab フォーカス対象から外します。
        tabIndex={isFilterPopoverOpen ? -1 : 0}
        // 追加: popover open 中は root の keyboard/paste handler 自体を外します。
        onKeyDown={isFilterPopoverOpen ? undefined : handleKeyDown}
        onPaste={isFilterPopoverOpen ? undefined : handlePaste}
      >
        <div
          ref={bodyScrollRef}
          style={{
            overflow: 'auto',
            maxHeight: 480,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: rowHeaderWidth + totalColumnWidth,
              minWidth: rowHeaderWidth + totalColumnWidth,
              height: headerHeight + totalBodyHeight,
            }}
          >
            <GridHeaderRow
              rowHeaderWidth={rowHeaderWidth}
              headerHeight={headerHeight}
              rowHeaderCellStyle={rowHeaderCellStyle}
              headerCellBaseStyle={headerCellBaseStyle}
              isCornerHovered={isCornerHovered}
              isWholeGridSelected={isWholeGridSelected}
              filteredRowsLength={filteredRows.length}
              visibleColumnsLength={visibleColumns.length}
              virtualColumns={virtualColumns}
              virtualColumnIndexes={virtualColumnIndexes}
              columnMeasurements={columnMeasurements}
              visibleColumns={visibleColumns}
              hoveredColumnIndex={hoveredColumnIndex}
              uiState={uiState}
              columnFilterValues={uiState.filters.columnFilters}
              sortState={uiState.sort}
              getHeaderActionButtonStyle={getHeaderActionButtonStyle}
              getSortIndicator={getSortIndicator}
              onCornerPointerDown={handleCornerHeaderPointerDown}
              onCornerPointerEnter={() => setIsCornerHovered(true)}
              onCornerPointerLeave={() => setIsCornerHovered(false)}
              onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
              onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
              onColumnHeaderPointerLeave={(colIndex) =>
                setHoveredColumnIndex((current) =>
                  current === colIndex ? null : current,
                )
              }
              onColumnSortButtonPointerDown={handleColumnSortButtonPointerDown}
              onColumnFilterButtonPointerDown={openColumnFilterPopover}
              onColumnResizePointerDown={handleColumnResizePointerDown}
            />

            <SelectionOverlay
              rect={selectionOverlayRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
            />

            <ActiveCellOverlay
              rect={activeCellRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
            />

            <CellEditorLayer
              rect={editorRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
              value={editorValue}
              onChange={setEditorValue}
              onCommit={commitEdit}
              onCancel={cancelEdit}
            />

            <GridBodyLayer
              filteredRows={filteredRows}
              filteredRowKeys={filteredRowKeys}
              visibleColumns={visibleColumns}
              virtualRows={virtualRows}
              virtualColumns={virtualColumns}
              virtualRowIndexes={virtualRowIndexes}
              virtualColumnIndexes={virtualColumnIndexes}
              columnMeasurements={columnMeasurements}
              rowHeaderWidth={rowHeaderWidth}
              headerHeight={headerHeight}
              rowHeight={rowHeight}
              rowHeaderCellStyle={rowHeaderCellStyle}
              hoveredRowIndex={hoveredRowIndex}
              isWholeGridSelected={isWholeGridSelected}
              uiState={uiState}
              readOnly={readOnly}
              canEditCell={canEditCell}
              onRowHeaderPointerDown={handleRowHeaderPointerDown}
              onRowHeaderPointerEnter={handleRowHeaderPointerEnter}
              onRowHeaderPointerLeave={(rowIndex) =>
                setHoveredRowIndex((current) =>
                  current === rowIndex ? null : current,
                )
              }
              onCellPointerDown={handleCellPointerDown}
              onCellPointerEnter={handleCellPointerEnter}
              onCellDoubleClick={handleCellDoubleClickWithController}
              renderCellContent={renderCellContent}
            />
          </div>
        </div>
      </div>

      {resolvedBottomBar}

      {renderedFilterPopover}
    </div>
  );
}

export default SpreadsheetGrid;