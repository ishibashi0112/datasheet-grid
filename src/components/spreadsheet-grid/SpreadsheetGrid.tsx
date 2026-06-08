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
import { useGridBarContext } from './hooks/useGridBarContext';
import { useGridEditController } from './hooks/useGridEditController';
import { useGridKeyboardInteractions } from './hooks/useGridKeyboardInteractions';
import { useGridPointerInteractions } from './hooks/useGridPointerInteractions';
import { useGridViewportSync } from './hooks/useGridViewportSync';
import {
  applyColumnFilters,
  applyGlobalFilter,
  type GridRowModelLike,
} from './logic/filtering';
// 変更(10-C): 3ペインレイアウト構築用の helper / 型を追加インポートします。
// 変更理由: reorderColumnsByPane / buildGridPaneLayout を SpreadsheetGrid で使い、
//           PaneColumnEntry 型を各ペインの描画エントリ受け渡しに使うためです。
import {
  buildColumnMeasurements,
  reorderColumnsByPane,
  buildGridPaneLayout,
  type PaneColumnEntry,
} from './logic/geometry';
import { applySort } from './logic/sorting';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  SpreadsheetGridProps,
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
  // ── refs ──────────────────────────────────────────────
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const editorActionGuardRef = useRef(false);

  // 追加(10-B): 左固定ペインのスクロール要素 ref です。
  const leftPaneScrollRef = useRef<HTMLDivElement | null>(null);
  // 追加(10-B): 右固定ペインのスクロール要素 ref です。
  const rightPaneScrollRef = useRef<HTMLDivElement | null>(null);

  // ── local state ───────────────────────────────────────
  const [editorValue, setEditorValue] = useState('');
  const [isCornerHovered, setIsCornerHovered] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(
    null,
  );

  // ── columns ───────────────────────────────────────────
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible !== false),
    [columns],
  );

  // 追加(10-B): pinned 属性に応じて列を視覚順序（left → center → right）に並べ替えます。
  //             pinned 列がない現時点では visibleColumns と同じ順序になります。
  const orderedColumns = useMemo(
    () => reorderColumnsByPane(visibleColumns),
    [visibleColumns],
  );

  const resolvedRowKeyGetter = useMemo(
    () => rowKeyGetter ?? ((_row: T, index: number) => index),
    [rowKeyGetter],
  );

  // ── reducer ───────────────────────────────────────────
  const [uiState, dispatch] = useReducer(
    gridUiReducer,
    visibleColumns,
    createInitialGridUiState,
  );

  // ── 3ペイン geometry（10-B） ──────────────────────────
  // 追加(10-B): 3 ペイン（left / center / right）のジオメトリを構築します。
  // 変更理由: DOM を 3 ペイン flex レイアウトに分離するために必要です。
  const paneLayout = useMemo(
    () => buildGridPaneLayout(orderedColumns, uiState.columnWidths),
    [orderedColumns, uiState.columnWidths],
  );

  // 追加(10-C): 左／右固定ペインが存在するか（= 固定列があるか）です。
  const hasLeftPane = paneLayout.left.entries.length > 0;
  const hasRightPane = paneLayout.right.entries.length > 0;

  // 追加(10-C): 行ヘッダー（#・行番号）を持つペインです。
  //             左固定列があれば左ペイン、無ければ従来どおり中央ペインが持ちます。
  //             これにより固定列なしのときは見た目・挙動が従来と完全に一致します。
  const centerOwnsRowHeader = !hasLeftPane;

  // 追加(10-C): 各ペインで列の前に確保する先頭幅です。
  //             行ヘッダーを持つペインは rowHeaderWidth、それ以外は 0 になります。
  const leftLeadingWidth = rowHeaderWidth; // 左ペインは行ヘッダーを内包します
  const centerLeadingWidth = centerOwnsRowHeader ? rowHeaderWidth : 0;
  const rightLeadingWidth = 0;

  // 追加(10-B→10-C): 左固定ペインの合計幅です（row header + left-pinned 列）。
  //             pinned 列がなければ 0 でペインは非表示になります。
  const leftPaneTotalWidth = hasLeftPane
    ? leftLeadingWidth + paneLayout.left.totalWidth
    : 0;

  // 追加(10-B): 右固定ペインの合計幅です。
  const rightPaneTotalWidth = paneLayout.right.totalWidth;

  // 追加(10-C): 中央ペインの内側コンテンツ幅です。
  //             固定列なしのときは rowHeaderWidth + totalColumnWidth となり従来と同一です。
  const centerContentWidth = centerLeadingWidth + paneLayout.center.totalWidth;

  // ── filter popover ────────────────────────────────────
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

  // ── column widths sync ────────────────────────────────
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

  // ── row models (source → filtered → sorted) ──────────
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

  // ── column measurements ───────────────────────────────
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

  // ── virtualizer ───────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    useFlushSync: false,
  });

  // 変更(10-C): 列の仮想化は「中央ペインの列エントリ」に対して行います。
  // 変更理由: 固定列は中央スクロール対象外。中央ペインの水平スクロール範囲＝
  //           center.totalWidth に合わせ、virtual item の index は
  //           centerEntries 上の index になります。
  //           固定列なしのときは centerEntries が visibleColumns と同順・同座標のため、
  //           従来の列仮想化と完全に一致します。
  const centerEntries = paneLayout.center.entries;

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: centerEntries.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: (index) =>
      centerEntries[index]?.paneLocalSize ??
      centerEntries[index]?.column.width ??
      120,
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

  // 追加(10-C): 各ペインで実際に描画する列エントリ群です。
  //             中央ペインは仮想化済みの部分集合、固定ペインは全エントリを描画します。
  const centerRenderEntries = useMemo<PaneColumnEntry<T>[]>(
    () =>
      virtualColumns
        .map((item) => centerEntries[item.index])
        .filter((entry): entry is PaneColumnEntry<T> => Boolean(entry)),
    [virtualColumns, centerEntries],
  );

  const leftRenderEntries = paneLayout.left.entries;
  const rightRenderEntries = paneLayout.right.entries;

  // ── active cell / editor rect ─────────────────────────
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

  // ── viewport sync ────────────────────────────────────
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

  // 追加(10-B): 中央ペインの垂直スクロールを左右固定ペインへ同期します。
  // 変更理由: 3ペイン物理分離のため、vertical scroll は中央ペインがマスターで
  //           左右ペインへ scrollTop を転写する必要があります。
  useEffect(() => {
    const center = bodyScrollRef.current;
    if (!center) return;

    const syncVerticalScroll = () => {
      const { scrollTop } = center;
      if (leftPaneScrollRef.current) {
        leftPaneScrollRef.current.scrollTop = scrollTop;
      }
      if (rightPaneScrollRef.current) {
        rightPaneScrollRef.current.scrollTop = scrollTop;
      }
    };

    center.addEventListener('scroll', syncVerticalScroll, { passive: true });
    return () => {
      center.removeEventListener('scroll', syncVerticalScroll);
    };
  }, []);

  // ── pointer interactions ──────────────────────────────
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

  // ── clipboard ─────────────────────────────────────────
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

  // ── double click → edit ───────────────────────────────
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

  // ── keyboard ──────────────────────────────────────────
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

  // ── edit controller ───────────────────────────────────
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

  // ── selection overlay rect ────────────────────────────
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

  // ── corner header ─────────────────────────────────────
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

  // ── column resize ─────────────────────────────────────
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

  // ── filter popover actions ────────────────────────────
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

  // ── sort ──────────────────────────────────────────────
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

  // ── header action button style ────────────────────────
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

  // ── cell content renderer ─────────────────────────────
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

  // ── global filter setter ──────────────────────────────
  // 追加: topBar / bottomBar 用に global filter setter を公開します。
  const setGlobalFilterText = useCallback(
    (value: string) => {
      dispatch(gridActions.setGlobalFilter(value));
    },
    [dispatch],
  );

  // ── bar context ───────────────────────────────────────
  // 追加: bar 用 context / derived summary は hook へ逃がします。
  const { slotContext } = useGridBarContext({
    rows,
    filteredRows,
    columns,
    visibleColumns,
    uiState,
    setGlobalFilterText,
  });

  // ── styles ────────────────────────────────────────────
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

  // 追加(10-B): 3ペイン flex コンテナの style です。
  // 変更理由: maxHeight を従来の bodyScrollRef から flex コンテナへ移し、
  //           左右ペインも同じ高さ制約に収めるためです。
  const paneContainerStyle: CSSProperties = {
    display: 'flex',
    maxHeight: 480,
    overflow: 'hidden',
  };

  // 追加(10-B): 固定ペイン共通の style です。
  // 変更理由: overflow: hidden でスクロールバーを非表示にしつつ、
  //           JS で scrollTop を同期して縦スクロールを実現します。
  const pinnedPaneStyle = (width: number): CSSProperties => ({
    width,
    flexShrink: 0,
    overflow: 'hidden',
  });

  // 追加(10-B): 中央ペイン（従来の bodyScrollRef）の style です。
  // 変更理由: maxHeight は親 flex コンテナ側で管理するため、
  //           ここでは flex: 1 と overflow: auto のみ指定します。
  const centerPaneStyle: CSSProperties = {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'auto',
  };

  // ── filter popover ────────────────────────────────────
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

  // ── slot bars ─────────────────────────────────────────
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

  // ── render ────────────────────────────────────────────
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
        {/* ── 追加(10-B): 3ペイン flex コンテナ ────────────── */}
        {/* 変更理由: AG Grid 互換の物理 DOM 分離レイアウトです。    */}
        {/*   pinned 列がない場合は左右ペインが width:0 で非表示、  */}
        {/*   中央ペインが flex:1 で従来と同じ見た目になります。    */}
        <div style={paneContainerStyle}>

          {/* ── 左固定ペイン ── */}
          {/* 変更(10-C): 左固定列があるときだけヘッダー・ボディ・行ヘッダーを描画します。*/}
          {/*   固定列が無いときは hasLeftPane=false で width:0 の空ペイン（従来どおり）。*/}
          <div
            ref={leftPaneScrollRef}
            style={pinnedPaneStyle(leftPaneTotalWidth)}
          >
            {hasLeftPane && (
              <div
                style={{
                  position: 'relative',
                  width: leftPaneTotalWidth,
                  minWidth: leftPaneTotalWidth,
                  height: headerHeight + totalBodyHeight,
                }}
              >
                <GridHeaderRow
                  pane="left"
                  ownsRowHeader
                  leadingWidth={leftLeadingWidth}
                  rowHeaderWidth={rowHeaderWidth}
                  headerHeight={headerHeight}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  headerCellBaseStyle={headerCellBaseStyle}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  filteredRowsLength={filteredRows.length}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={leftRenderEntries}
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
                  onColumnSortButtonPointerDown={
                    handleColumnSortButtonPointerDown
                  }
                  onColumnFilterButtonPointerDown={openColumnFilterPopover}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
                />

                <GridBodyLayer
                  pane="left"
                  ownsRowHeader
                  leadingWidth={leftLeadingWidth}
                  filteredRows={filteredRows}
                  filteredRowKeys={filteredRowKeys}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={leftRenderEntries}
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
            )}
          </div>

          {/* ── 中央スクロールペイン（従来の bodyScrollRef） ── */}
          {/* 変更(10-C): 行ヘッダーは左固定列が無いときだけ中央が持ちます（従来と同一）。*/}
          <div
            ref={bodyScrollRef}
            style={centerPaneStyle}
          >
            <div
              style={{
                position: 'relative',
                width: centerContentWidth,
                minWidth: centerContentWidth,
                height: headerHeight + totalBodyHeight,
              }}
            >
              <GridHeaderRow
                pane="center"
                ownsRowHeader={centerOwnsRowHeader}
                leadingWidth={centerLeadingWidth}
                rowHeaderWidth={rowHeaderWidth}
                headerHeight={headerHeight}
                rowHeaderCellStyle={rowHeaderCellStyle}
                headerCellBaseStyle={headerCellBaseStyle}
                isCornerHovered={isCornerHovered}
                isWholeGridSelected={isWholeGridSelected}
                filteredRowsLength={filteredRows.length}
                visibleColumnsLength={visibleColumns.length}
                renderEntries={centerRenderEntries}
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
                pane="center"
                ownsRowHeader={centerOwnsRowHeader}
                leadingWidth={centerLeadingWidth}
                filteredRows={filteredRows}
                filteredRowKeys={filteredRowKeys}
                virtualRows={virtualRows}
                virtualRowIndexes={virtualRowIndexes}
                renderEntries={centerRenderEntries}
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

          {/* ── 右固定ペイン ── */}
          {/* 変更(10-C): 右固定列があるときだけ描画します。行ヘッダーは持ちません。*/}
          <div
            ref={rightPaneScrollRef}
            style={pinnedPaneStyle(rightPaneTotalWidth)}
          >
            {hasRightPane && (
              <div
                style={{
                  position: 'relative',
                  width: rightPaneTotalWidth,
                  minWidth: rightPaneTotalWidth,
                  height: headerHeight + totalBodyHeight,
                }}
              >
                <GridHeaderRow
                  pane="right"
                  ownsRowHeader={false}
                  leadingWidth={rightLeadingWidth}
                  rowHeaderWidth={rowHeaderWidth}
                  headerHeight={headerHeight}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  headerCellBaseStyle={headerCellBaseStyle}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  filteredRowsLength={filteredRows.length}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={rightRenderEntries}
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
                  onColumnSortButtonPointerDown={
                    handleColumnSortButtonPointerDown
                  }
                  onColumnFilterButtonPointerDown={openColumnFilterPopover}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
                />

                <GridBodyLayer
                  pane="right"
                  ownsRowHeader={false}
                  leadingWidth={rightLeadingWidth}
                  filteredRows={filteredRows}
                  filteredRowKeys={filteredRowKeys}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={rightRenderEntries}
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
            )}
          </div>

        </div>
        {/* ── /3ペイン flex コンテナ ── */}
      </div>

      {resolvedBottomBar}
      {renderedFilterPopover}
    </div>
  );
}

export default SpreadsheetGrid;