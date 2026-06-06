// 追加: 列フィルター UI 整備 + ソート/フィルター見た目強化を反映します。
import {
  useEffect,
  useMemo,
  useCallback,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
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
import CellEditorLayer, {
  type EditorCommitDirection,
} from './CellEditorLayer';
import ColumnFilterPopover from './view/ColumnFilterPopover';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  SpreadsheetGridProps,
} from './model/gridTypes';
import {
  applyColumnFilters,
  applyGlobalFilter,
  type GridRowModelLike,
} from './logic/filtering';
import { applySort } from './logic/sorting';
import {
  buildColumnMeasurements,
  clamp,
  findColumnIndexFromOffset,
} from './logic/geometry';
import { isPrintableKey, shouldIgnoreGridKeydown } from './logic/domGuards';
import { toExcelColumnName } from './utils/excelColumnName';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import {
  applyClipboardMatrixToRows,
  parseClipboardText,
  serializeSelectionToTsv,
} from './utils/clipboard';

// 追加: 元 rows と filteredRows の対応を安定して持つための row model です。
type SourceRowModel<T> = GridRowModelLike<T> & {
  rowKey: GridRowKey;
};

// 追加: 列フィルターポップオーバーの状態です。
type HeaderFilterPopoverState = {
  columnKey: string;
  draftValue: string;
};

// 追加: body 直下 portal popover の配置情報です。
type FilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
};

export function SpreadsheetGrid<T>({
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
  className,
}: SpreadsheetGridProps<T>) {
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const editorActionGuardRef = useRef(false);
  const [isCornerHovered, setIsCornerHovered] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(
    null,
  );
  const [filterPopoverState, setFilterPopoverState] =
    useState<HeaderFilterPopoverState | null>(null);
  const [filterPopoverLayout, setFilterPopoverLayout] =
    useState<FilterPopoverLayout | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverAnchorButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterTextInputRef = useRef<HTMLInputElement | null>(null);
  const filterSelectRef = useRef<HTMLSelectElement | null>(null);
  const isFilterPopoverOpen = filterPopoverState !== null;
  const openedFilterColumnKey = filterPopoverState?.columnKey ?? null;

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

  const updateFilterPopoverLayout = useCallback(() => {
    if (!openedFilterColumnKey || !filterPopoverAnchorButtonRef.current) {
      setFilterPopoverLayout(null);
      return;
    }

    const anchorRect = filterPopoverAnchorButtonRef.current.getBoundingClientRect();

    const POPUP_WIDTH = 240;
    const VIEWPORT_MARGIN = 8;
    const OFFSET_Y = 8;
    const ESTIMATED_POPUP_HEIGHT = 260;

    let left = anchorRect.right - POPUP_WIDTH;
    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN);

    let top = anchorRect.bottom + OFFSET_Y;
    if (top + ESTIMATED_POPUP_HEIGHT > window.innerHeight - VIEWPORT_MARGIN) {
      top = anchorRect.top - ESTIMATED_POPUP_HEIGHT - OFFSET_Y;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    setFilterPopoverLayout((current) => {
      if (
        current &&
        current.top === top &&
        current.left === left &&
        current.width === POPUP_WIDTH
      ) {
        return current;
      }

      return {
        top,
        left,
        width: POPUP_WIDTH,
      };
    });
  }, [openedFilterColumnKey]);

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

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, rowHeight, filteredRows.length]);

  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer, columnMeasurements]);

  useEffect(() => {
    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
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

  useEffect(() => {
    if (!openedFilterColumnKey) {
      return;
    }

    updateFilterPopoverLayout();

    const handleReposition = () => {
      updateFilterPopoverLayout();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [openedFilterColumnKey, updateFilterPopoverLayout]);

  useEffect(() => {
    if (!openedFilterColumnKey || !filterPopoverLayout) {
      return;
    }

    const targetColumn = visibleColumns.find(
      (column) => column.key === openedFilterColumnKey,
    );
    const filterType = targetColumn?.filterType ?? 'text';

    let frameId1 = 0;
    let frameId2 = 0;

    frameId1 = requestAnimationFrame(() => {
      frameId2 = requestAnimationFrame(() => {
        if (filterType === 'select') {
          filterSelectRef.current?.focus();
          return;
        }

        const inputElement = filterTextInputRef.current;
        if (!inputElement) {
          return;
        }

        inputElement.focus();
        const end = inputElement.value.length;
        inputElement.setSelectionRange(end, end);
      });
    });

    return () => {
      cancelAnimationFrame(frameId1);
      cancelAnimationFrame(frameId2);
    };
  }, [
    openedFilterColumnKey,
    filterPopoverLayout?.top,
    filterPopoverLayout?.left,
    filterPopoverLayout?.width,
    visibleColumns,
  ]);

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

  useEffect(() => {
    if (!bodyScrollRef.current) {
      return;
    }
    const scrollElement = bodyScrollRef.current;
    const maxScrollLeft = Math.max(
      rowHeaderWidth + totalColumnWidth - scrollElement.clientWidth,
      0,
    );
    const maxScrollTop = Math.max(
      headerHeight + totalBodyHeight - scrollElement.clientHeight,
      0,
    );
    if (scrollElement.scrollLeft > maxScrollLeft) {
      scrollElement.scrollLeft = maxScrollLeft;
    }
    if (scrollElement.scrollTop > maxScrollTop) {
      scrollElement.scrollTop = maxScrollTop;
    }
  }, [totalColumnWidth, totalBodyHeight, rowHeaderWidth, headerHeight]);

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

  useEffect(() => {
    if (!bodyScrollRef.current || !activeCellRect) {
      return;
    }
    const scrollElement = bodyScrollRef.current;
    const cellTop = headerHeight + activeCellRect.top;
    const cellBottom = cellTop + activeCellRect.height;
    const cellLeft = rowHeaderWidth + activeCellRect.left;
    const cellRight = cellLeft + activeCellRect.width;
    const currentScrollTop = scrollElement.scrollTop;
    const currentScrollLeft = scrollElement.scrollLeft;
    const viewportHeight = scrollElement.clientHeight;
    const viewportWidth = scrollElement.clientWidth;
    let nextScrollTop = currentScrollTop;
    let nextScrollLeft = currentScrollLeft;
    const visibleTop = currentScrollTop + headerHeight;
    const visibleBottom = currentScrollTop + viewportHeight;
    if (cellTop < visibleTop) {
      nextScrollTop = Math.max(cellTop - headerHeight, 0);
    } else if (cellBottom > visibleBottom) {
      nextScrollTop = Math.max(cellBottom - viewportHeight, 0);
    }
    const visibleLeft = currentScrollLeft + rowHeaderWidth;
    const visibleRight = currentScrollLeft + viewportWidth;
    if (cellLeft < visibleLeft) {
      nextScrollLeft = Math.max(cellLeft - rowHeaderWidth, 0);
    } else if (cellRight > visibleRight) {
      nextScrollLeft = Math.max(cellRight - viewportWidth, 0);
    }
    if (
      nextScrollTop !== currentScrollTop ||
      nextScrollLeft !== currentScrollLeft
    ) {
      scrollElement.scrollTo({
        top: nextScrollTop,
        left: nextScrollLeft,
        behavior: 'auto',
      });
    }
  }, [activeCellRect, headerHeight, rowHeaderWidth]);

  const getCellCoordFromClientPoint = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      if (
        !bodyScrollRef.current ||
        filteredRows.length === 0 ||
        visibleColumns.length === 0
      ) {
        return null;
      }
      const scrollElement = bodyScrollRef.current;
      const rect = scrollElement.getBoundingClientRect();
      const x = scrollElement.scrollLeft + clientX - rect.left - rowHeaderWidth;
      const y = scrollElement.scrollTop + clientY - rect.top - headerHeight;
      const row = clamp(Math.floor(y / rowHeight), 0, filteredRows.length - 1);
      const normalizedX = Math.max(x, 0);
      const col = findColumnIndexFromOffset(columnMeasurements, normalizedX);
      return {
        row,
        col: clamp(col, 0, visibleColumns.length - 1),
      };
    },
    [
      filteredRows.length,
      visibleColumns.length,
      columnMeasurements,
      rowHeaderWidth,
      headerHeight,
      rowHeight,
    ],
  );

  const updateSelectionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!uiState.dragState || uiState.dragState.type !== 'selection') {
        return;
      }
      const cell = getCellCoordFromClientPoint(clientX, clientY);
      if (!cell) {
        return;
      }
      if (uiState.dragState.selectionKind === 'cell') {
        dispatch(gridActions.updateSelection(cell));
        return;
      }
      if (uiState.dragState.selectionKind === 'row') {
        dispatch(gridActions.updateRowSelection(cell.row));
        return;
      }
      if (uiState.dragState.selectionKind === 'col') {
        dispatch(gridActions.updateColumnSelection(cell.col));
      }
    },
    [getCellCoordFromClientPoint, uiState.dragState],
  );

  useEffect(() => {
    if (uiState.dragState?.type !== 'selection') {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      return;
    }
    const EDGE_THRESHOLD = 24;
    const SCROLL_STEP = 18;
    const tick = () => {
      const scrollElement = bodyScrollRef.current;
      const pointer = pointerClientRef.current;
      if (!scrollElement || !pointer) {
        autoScrollFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const rect = scrollElement.getBoundingClientRect();
      let nextScrollTop = scrollElement.scrollTop;
      let nextScrollLeft = scrollElement.scrollLeft;
      if (pointer.y < rect.top + EDGE_THRESHOLD) {
        nextScrollTop = Math.max(scrollElement.scrollTop - SCROLL_STEP, 0);
      } else if (pointer.y > rect.bottom - EDGE_THRESHOLD) {
        nextScrollTop = scrollElement.scrollTop + SCROLL_STEP;
      }
      if (pointer.x < rect.left + EDGE_THRESHOLD) {
        nextScrollLeft = Math.max(scrollElement.scrollLeft - SCROLL_STEP, 0);
      } else if (pointer.x > rect.right - EDGE_THRESHOLD) {
        nextScrollLeft = scrollElement.scrollLeft + SCROLL_STEP;
      }
      if (
        nextScrollTop !== scrollElement.scrollTop ||
        nextScrollLeft !== scrollElement.scrollLeft
      ) {
        scrollElement.scrollTo({
          top: nextScrollTop,
          left: nextScrollLeft,
          behavior: 'auto',
        });
        updateSelectionFromPointer(pointer.x, pointer.y);
      }
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [uiState.dragState, updateSelectionFromPointer]);

  const isWholeGridSelected = useMemo(() => {
    if (
      filteredRows.length === 0 ||
      visibleColumns.length === 0 ||
      uiState.selection?.type !== 'cell'
    ) {
      return false;
    }
    const normalizedRange = normalizeCellRange(uiState.selection.range);
    return (
      normalizedRange.start.row === 0 &&
      normalizedRange.start.col === 0 &&
      normalizedRange.end.row === filteredRows.length - 1 &&
      normalizedRange.end.col === visibleColumns.length - 1
    );
  }, [uiState.selection, filteredRows.length, visibleColumns.length]);

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
  }, [filteredRows.length, visibleColumns.length]);

  const serializeWholeGridToTsv = useCallback(() => {
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return '';
    }
    return filteredRows
      .map((row) =>
        visibleColumns
          .map((column) => {
            const rawValue = getCellValue(row, column);
            return column.formatClipboardValue
              ? column.formatClipboardValue(rawValue, row)
              : String(rawValue ?? '');
          })
          .join('\t'),
      )
      .join('\n');
  }, [filteredRows, visibleColumns]);

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

  const handleCornerHeaderPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
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
  };

  const handleCellPointerDown = (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    gridRootRef.current?.focus();
    dispatch(gridActions.activateCell(cell));
    if (enableRangeSelection) {
      dispatch(gridActions.startSelection(cell));
    }
  };

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

  const activateSingleCell = (cell: CellCoord) => {
    dispatch(gridActions.startSelection(cell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(cell));
  };

  const getMovedCell = (
    baseCell: CellCoord,
    deltaRow: number,
    deltaCol: number,
  ): CellCoord => ({
    row: clamp(
      baseCell.row + deltaRow,
      0,
      Math.max(filteredRows.length - 1, 0),
    ),
    col: clamp(
      baseCell.col + deltaCol,
      0,
      Math.max(visibleColumns.length - 1, 0),
    ),
  });

  const commitEdit = (direction?: EditorCommitDirection) => {
    if (editorActionGuardRef.current || !uiState.editingCell) {
      return;
    }
    const editingCell = uiState.editingCell;
    const nextCell =
      direction === 'down'
        ? getMovedCell(editingCell, 1, 0)
        : direction === 'right'
          ? getMovedCell(editingCell, 0, 1)
          : direction === 'left'
            ? getMovedCell(editingCell, 0, -1)
            : editingCell;
    const column = visibleColumns[editingCell.col];
    const originalRowIndex =
      filteredRowSourceIndexes[editingCell.row] ?? editingCell.row;
    const row = rows[originalRowIndex];
    if (!column || !row) {
      dispatch(gridActions.stopEdit());
      return;
    }
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
    editorActionGuardRef.current = true;
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
      activateSingleCell(nextCell);
      editorActionGuardRef.current = false;
    });
    dispatch(gridActions.stopEdit());
  };

  const cancelEdit = () => {
    if (editorActionGuardRef.current) {
      return;
    }
    editorActionGuardRef.current = true;
    dispatch(gridActions.stopEdit());
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
      editorActionGuardRef.current = false;
    });
  };

  const handleCellPointerEnter = (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (!enableRangeSelection) {
      return;
    }
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'cell'
    ) {
      return;
    }
    pointerClientRef.current = { x: event.clientX, y: event.clientY };
    dispatch(gridActions.updateSelection(cell));
  };

  const handleNativeDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleRowHeaderPointerDown = (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    gridRootRef.current?.focus();
    dispatch(gridActions.startRowSelection(rowIndex));
  };

  const handleRowHeaderPointerEnter = (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'row'
    ) {
      return;
    }
    pointerClientRef.current = { x: event.clientX, y: event.clientY };
    dispatch(gridActions.updateRowSelection(rowIndex));
  };

  const handleColumnHeaderPointerDown = (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    gridRootRef.current?.focus();
    dispatch(gridActions.startColumnSelection(colIndex));
  };

  const handleColumnHeaderPointerEnter = (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'col'
    ) {
      return;
    }
    pointerClientRef.current = { x: event.clientX, y: event.clientY };
    dispatch(gridActions.updateColumnSelection(colIndex));
  };

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
        selectColumnWidth(uiState, column.key) ?? column.width,
        column.minWidth ?? 60,
        column.maxWidth ?? 1000,
      ),
    );
  };

  const handleCopy = async () => {
    const text = isWholeGridSelected
      ? serializeWholeGridToTsv()
      : serializeSelectionToTsv(
          filteredRows,
          visibleColumns,
          uiState.selection as
            | {
                type: 'cell';
                range: {
                  start: { row: number; col: number };
                  end: { row: number; col: number };
                };
              }
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

  const getSortIndicator = (columnKey: string) => {
    if (
      !enableSorting ||
      uiState.sort.columnKey !== columnKey ||
      !uiState.sort.direction
    ) {
      return '↕';
    }
    return uiState.sort.direction === 'asc' ? '↑' : '↓';
  };

  const cycleColumnSort = (columnKey: string) => {
    if (!enableSorting) {
      return;
    }
    if (uiState.sort.columnKey !== columnKey || uiState.sort.direction === null) {
      dispatch(gridActions.setSort(columnKey, 'asc'));
      return;
    }
    if (uiState.sort.direction === 'asc') {
      dispatch(gridActions.setSort(columnKey, 'desc'));
      return;
    }
    dispatch(gridActions.clearSort());
  };

  const openColumnFilterPopover = (
    column: GridColumn<T>,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!enableColumnFilter) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    gridRootRef.current?.blur();

    filterPopoverAnchorButtonRef.current = event.currentTarget;

    setFilterPopoverState({
      columnKey: column.key,
      draftValue: String(uiState.filters.columnFilters[column.key] ?? ''),
    });
  };

  const closeColumnFilterPopover = useCallback(() => {
    setFilterPopoverState(null);
    setFilterPopoverLayout(null);
    filterPopoverAnchorButtonRef.current = null;
    filterTextInputRef.current = null;
    filterSelectRef.current = null;

    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, []);

  const updateFilterPopoverDraft = (value: string) => {
    setFilterPopoverState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        draftValue: value,
      };
    });
  };

  const applyFilterPopoverValue = () => {
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
  };

  const clearFilterPopoverValue = () => {
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    closeColumnFilterPopover();
  };

  const handleColumnSortButtonPointerDown = (
    columnKey: string,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    cycleColumnSort(columnKey);
  };

  useEffect(() => {
    if (!filterPopoverState) {
      return;
    }
    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (filterPopoverRef.current?.contains(targetNode)) {
        return;
      }
      closeColumnFilterPopover();
    };
    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [filterPopoverState, closeColumnFilterPopover]);

  const getHeaderActionButtonStyle = (isActive: boolean): CSSProperties => ({
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
  });

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

  const handleKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (isFilterPopoverOpen) {
      return;
    }

    if (shouldIgnoreGridKeydown(event.target)) {
      return;
    }

    if (uiState.editingCell) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await handleCopy();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (isWholeGridSelected) {
        dispatch(gridActions.clearSelection());
        dispatch(gridActions.activateCell(null));
        return;
      }
      selectEntireGrid();
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
    if (matrix.length === 0) {
      return;
    }

    const startFilteredRowIndex = uiState.activeCell.row;
    const startOriginalRowIndex =
      filteredRowSourceIndexes[startFilteredRowIndex] ?? startFilteredRowIndex;
    const startColIndex = uiState.activeCell.col;

    let workingRows = [...rows];
    let workingColumns = [...visibleColumns];
    let workingSourceIndexes = [...filteredRowSourceIndexes];

    const requiredOriginalRowCount = startOriginalRowIndex + matrix.length;
    if (requiredOriginalRowCount > workingRows.length) {
      if (createRow) {
        while (workingRows.length < requiredOriginalRowCount) {
          workingRows.push(createRow());
          workingSourceIndexes.push(workingRows.length - 1);
        }
      }
    }

    let maxPasteWidth = 0;
    for (
      let matrixRowIndex = 0;
      matrixRowIndex < matrix.length;
      matrixRowIndex += 1
    ) {
      const currentWidth = matrix[matrixRowIndex]?.length ?? 0;
      if (currentWidth > maxPasteWidth) {
        maxPasteWidth = currentWidth;
      }
    }
    if (maxPasteWidth === 0) {
      return;
    }

    const requiredColumnCount = startColIndex + maxPasteWidth;
    if (requiredColumnCount > workingColumns.length) {
      if (onColumnsChange && createOverflowColumn) {
        while (workingColumns.length < requiredColumnCount) {
          workingColumns.push(createOverflowColumn(workingColumns.length));
        }
        onColumnsChange(workingColumns);
      }
    }

    const nextRows = applyClipboardMatrixToRows(
      workingRows,
      workingSourceIndexes,
      workingColumns,
      matrix,
      startFilteredRowIndex,
      startColIndex,
      (originalRowIndex, colIndex, row, column) =>
        isCellEditable(
          { readOnly, canEditCell },
          originalRowIndex,
          colIndex,
          row,
          column,
        ),
    );

    const endRow = clamp(
      uiState.activeCell.row + Math.max(matrix.length - 1, 0),
      0,
      Math.max(
        Math.max(filteredRows.length - 1, 0),
        startFilteredRowIndex + matrix.length - 1,
      ),
    );
    const endCol = clamp(
      uiState.activeCell.col + Math.max((matrix[0]?.length ?? 1) - 1, 0),
      0,
      Math.max(
        Math.max(workingColumns.length - 1, 0),
        startColIndex + maxPasteWidth - 1,
      ),
    );

    onRowsChange(nextRows);
    dispatch(gridActions.startSelection(uiState.activeCell));
    dispatch(gridActions.updateSelection({ row: endRow, col: endCol }));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(uiState.activeCell));
  };

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
  };

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

  const openedFilterColumn = useMemo(
    () =>
      filterPopoverState
        ? visibleColumns.find(
            (column) => column.key === filterPopoverState.columnKey,
          ) ?? null
        : null,
    [filterPopoverState, visibleColumns],
  );

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

  return (
    <div className={className}>
      {enableGlobalFilter ? (
        <div style={{ marginBottom: 12 }}>
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
        onDragStart={handleNativeDragStart}
        onPointerMoveCapture={(event) => {
          pointerClientRef.current = { x: event.clientX, y: event.clientY };
          updateSelectionFromPointer(event.clientX, event.clientY);
        }}
        tabIndex={isFilterPopoverOpen ? -1 : 0}
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
                onPointerDown={handleCornerHeaderPointerDown}
                onPointerEnter={() => setIsCornerHovered(true)}
                onPointerLeave={() => setIsCornerHovered(false)}
                style={{
                  ...rowHeaderCellStyle,
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
                    filteredRows.length > 0 && visibleColumns.length > 0
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
                if (
                  !column ||
                  !measurement ||
                  !virtualColumnIndexes.has(colIndex)
                ) {
                  return null;
                }

                const isColumnFiltered =
                  String(uiState.filters.columnFilters[column.key] ?? '').trim()
                    .length > 0;

                return (
                  <div
                    key={column.key}
                    onPointerDown={(event) =>
                      handleColumnHeaderPointerDown(colIndex, event)
                    }
                    onPointerEnter={(event) => {
                      setHoveredColumnIndex(colIndex);
                      handleColumnHeaderPointerEnter(colIndex, event);
                    }}
                    onPointerLeave={() =>
                      setHoveredColumnIndex((current) =>
                        current === colIndex ? null : current,
                      )
                    }
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
                        : selectIsColumnSelected(uiState, colIndex)
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
                        backgroundColor: isColumnFiltered
                          ? '#bfdbfe'
                          : '#e2e8f0',
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
                              filterValue:
                                uiState.filters.columnFilters[column.key],
                              isFiltered: isColumnFiltered,
                            })
                          : column.title || column.key}
                      </div>

                      {enableSorting ? (
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            handleColumnSortButtonPointerDown(column.key, event)
                          }
                          title="並び替え"
                          style={getHeaderActionButtonStyle(
                            uiState.sort.columnKey === column.key &&
                              uiState.sort.direction !== null,
                          )}
                        >
                          {getSortIndicator(column.key)}
                        </button>
                      ) : null}

                      {enableColumnFilter ? (
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            openColumnFilterPopover(column, event)
                          }
                          title="列フィルター"
                          style={getHeaderActionButtonStyle(isColumnFiltered)}
                        >
                          {isColumnFiltered ? '●' : '○'}
                        </button>
                      ) : null}
                    </div>

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
                    onPointerDown={(event) =>
                      handleRowHeaderPointerDown(rowIndex, event)
                    }
                    onPointerEnter={(event) => {
                      setHoveredRowIndex(rowIndex);
                      handleRowHeaderPointerEnter(rowIndex, event);
                    }}
                    onPointerLeave={() =>
                      setHoveredRowIndex((current) =>
                        current === rowIndex ? null : current,
                      )
                    }
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

                    const isActive = selectIsActiveCell(
                      uiState,
                      rowIndex,
                      colIndex,
                    );
                    const isSelected = selectIsCellSelected(
                      uiState,
                      rowIndex,
                      colIndex,
                    );
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
                          handleCellPointerDown(
                            { row: rowIndex, col: colIndex },
                            event,
                          )
                        }
                        onPointerEnter={(event) =>
                          handleCellPointerEnter(
                            { row: rowIndex, col: colIndex },
                            event,
                          )
                        }
                        onDoubleClick={() =>
                          handleCellDoubleClick({
                            row: rowIndex,
                            col: colIndex,
                          })
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
          </div>
        </div>
      </div>

      {renderedFilterPopover}
    </div>
  );
}

export default SpreadsheetGrid;