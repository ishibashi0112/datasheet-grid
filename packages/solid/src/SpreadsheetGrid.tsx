// Solid 2.0 版のシェル(試作)。React 版の GridShell.tsx(5,715 行)のうち、表示・縦横の仮想化・固定列・範囲選択・
//   キー操作・text の編集・コピー貼り付け・元に戻す・命令的 API を、同じ core(createGridEngine と各コントローラ)の上に
//   Solid で組み直したもの。DOM と class は React 版と同じなので、styles.css をそのまま使います。
//
//   作り:
//   - 派生値は createMemo で、engine のリゾルバ(同じ入力なら同じ参照)を呼ぶだけ。React 版の useMemo の外皮と同じ並び。
//   - コントローラは connectController(primitives/controller.ts)で update を描画の段の effect から呼ぶ。
//   - store は primitives/gridStoreSignals.ts で signal にする(購読は onSettled の中)。
//   - 部品の本体では props を直接読まない(Solid 2.0 は本体での読み取りを警告する)。props は関数や memo の中で読む。
import { Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onSettled, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type {
  CellCoord,
  EditorCommitDirection,
  GridDensity,
  GridViewState,
} from '@ishibashi0112/spreadsheet-grid-core';
import { createGridEngine } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/createGridEngine';
import type { GridColumn as UnboundGridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import { gridActions } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridActions';
import { buildSelectionSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import {
  buildColumnMeasurements,
  computeSinglePaneColumnExtent,
  type ColumnPane,
  type PaneColumnEntry,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import {
  resolveSelectionBand,
  resolveSelectionExtents,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionOverlayGeometry';
import { resolveGridHeightLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridHeight';
import { resolveGridThemeClassName } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/theme';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/systemColorSchemeStore';
import { clearCellsInSelection } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/clearCells';
import { writeRowsCell } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/editorValues';
import { decideCellWrite } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/validation';
import { getCellValue, isViewCellEditable } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import {
  createKeyboardController,
  resolveFirstDataCell,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/keyboardController';
import { createEditController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/editController';
import {
  computeIsWholeGridSelected,
  createClipboardController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/clipboardController';
import { createPointerInteractionsController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/pointerInteractionsController';
import { createHistoryController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/historyController';
import {
  createScrollScaleAnchor,
  createViewportSyncController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/viewportSyncController';
import type { GridColumn, SpreadsheetGridProps } from './model/gridTypes';
import { createGridStoreSignals } from './primitives/gridStoreSignals';
import { connectController } from './primitives/controller';
import { createColumnVirtualizer } from './primitives/columnVirtualizer';
import { px, toSolidStyle } from './primitives/style';
import { HeaderRow } from './view/HeaderRow';
import { BodyRows, type CellRenderState } from './view/BodyRows';
import { Overlay, type OverlayRect } from './view/Overlay';
import { TextEditor } from './view/TextEditor';

const DENSITY_DIMENSIONS: Record<GridDensity, { rowHeight: number; headerHeight: number }> = {
  compact: { rowHeight: 28, headerHeight: 32 },
  standard: { rowHeight: 36, headerHeight: 40 },
  comfortable: { rowHeight: 44, headerHeight: 48 },
};
const EMPTY_ROWS: never[] = [];
const NO_COLUMNS: never[] = [];
const noopRenderDetailToggleCell = () => null;

type MutableRef<V> = { current: V };

export function SpreadsheetGrid<T extends object>(props: SpreadsheetGridProps<T>): JSX.Element {
  // ── props(既定値つきの読み取り。本体では読まず、関数 / memo の中で読む) ──
  const rows = createMemo(() => (props.rows ?? EMPTY_ROWS) as T[]);
  const columns = createMemo(() => props.columns as unknown as UnboundGridColumn<T>[]);
  const density = () => props.density ?? 'standard';
  const rowHeight = () => props.rowHeight ?? DENSITY_DIMENSIONS[density()].rowHeight;
  const headerHeight = () => props.headerHeight ?? DENSITY_DIMENSIONS[density()].headerHeight;
  const rowHeaderWidth = () => props.rowHeaderWidth ?? 56;
  const readOnly = () => props.readOnly ?? false;
  const enableRangeSelection = () => props.enableRangeSelection ?? true;
  const enableSorting = () => props.enableSorting ?? true;
  const enableRowHover = () => props.enableRowHover ?? true;
  const columnInputs = () => ({
    columns: columns(),
    isServerSide: false,
    enableRowDrag: false,
    hasRowsChange: props.onRowsChange != null,
    detailToggleColumnActive: false,
    renderDetailToggleCell: noopRenderDetailToggleCell,
  });

  // ── エンジン(1 回だけ作る) ──
  const engine = createGridEngine<T>({
    features: {},
    columnInputs: untrack(columnInputs),
    serverSide: {
      isServerSide: false,
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: untrack(enableSorting),
    },
  });
  onCleanup(() => engine.dispose());
  const store = engine.store;
  const dispatch = store.dispatch;
  const { state: ui, view } = createGridStoreSignals(store);
  const setView = (patch: Partial<GridViewState>) => store.setViewState(patch);

  // ── DOM の参照(コントローラは { current } を受ける) ──
  const gridRootRef: MutableRef<HTMLDivElement | null> = { current: null };
  const scrollContainerRef: MutableRef<HTMLDivElement | null> = { current: null };
  const bodyScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const leftPaneScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const rightPaneScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const pointerClientRef: MutableRef<{ x: number; y: number } | null> = { current: null };
  const autoScrollFrameRef: MutableRef<number | null> = { current: null };
  const editorActionGuardRef: MutableRef<boolean> = { current: false };
  const cellDoubleClickRef: MutableRef<(cell: CellCoord, event: MouseEvent) => void> = { current: () => {} };

  // ── 列 ──
  const columnResolution = createMemo(() => engine.resolveColumns(columnInputs()));
  const visibleColumns = () => columnResolution().visibleColumns;
  const orderedColumns = () => columnResolution().orderedColumns;
  const resolvedRowKeyGetter = createMemo(() => props.rowKeyGetter ?? ((_row: T, index: number) => index));
  const selectionSnapshot = createMemo(() => buildSelectionSnapshot(ui().selection));
  const paneResolution = createMemo(() =>
    engine.resolvePaneLayout({
      orderedColumns: orderedColumns(),
      columnWidths: ui().columnWidths,
      viewportWidth: view().viewportWidth,
      rowHeaderWidth: rowHeaderWidth(),
    }),
  );
  const paneLayout = () => paneResolution().paneLayout;

  // ── 行(clientSide だけ。フィルター / グループ / ラベル行は無し) ──
  const baseOrder = createMemo(() => engine.rowPipeline.resolveBaseOrder(rows().length, null));
  const orderResolution = createMemo(() =>
    engine.rowPipeline.resolveOrder({
      rows: rows(),
      labelLayout: null,
      filterSortColumns: columnResolution().filterSortColumns,
      columnFilters: ui().filters.columnFilters,
      globalFilteredOrder: baseOrder(),
      sort: ui().sort,
      rowDragAvailable: false,
    }),
  );
  const clientRowModel = createMemo(() =>
    engine.rowPipeline.resolveClientSideRowModel({
      rows: rows(),
      order: orderResolution().order,
      rowGroupingActive: false,
      labelLayout: null,
      groupColumns: NO_COLUMNS,
      aggColumns: NO_COLUMNS,
      collapsedGroupKeys: ui().collapsedGroupKeys,
      rowKeyGetter: resolvedRowKeyGetter(),
      sort: ui().sort,
      sortActive: ui().sort.length > 0,
    }),
  );
  const rowModel = () => clientRowModel().rowModel;
  const viewRowCount = createMemo(() => rowModel().getRowCount());
  const viewColCount = () => orderedColumns().length;

  // 表示行数 / 列数が減ったら選択を範囲内へ詰める(React 版の useEffect と同じ)。
  createEffect(
    () => [viewRowCount(), viewColCount()] as const,
    ([rowCount, colCount]) => {
      dispatch(gridActions.clampSelectionToRowCount(rowCount, colCount));
    },
  );

  // ── 縦のレイアウト(行の仮想化は core が計算する) ──
  const vertical = createMemo(() =>
    engine.resolveVerticalLayout({
      isServerSide: false,
      autoHeight: false,
      visibleColumns: visibleColumns(),
      viewRowCount: viewRowCount(),
      estimateRowHeight: rowHeight(),
      rowHeight: rowHeight(),
      headerHeight: headerHeight(),
      viewportHeight: view().viewportHeight,
      scrollTop: view().scrollTop,
      rowModel: rowModel(),
      measuredHeights: engine.autoHeightMeasurer.measuredHeights,
      autoHeightVersion: 0,
      detailRowEnabled: false,
      expandedDetailRowKeys: ui().expandedDetailRowKeys,
      detailHeight: 0,
      detailIsExpandable: undefined,
      detailIndexCacheRef: engine.detailIndexCache,
      labelDisplay: null,
    }),
  );

  // ── スクロールの同期(見える大きさ / scrollTop を view スライスへ) ──
  connectController(engine.scrollSync, () => ({
    scrollContainerRef,
    setViewState: store.setViewState,
    onScroll: undefined,
    footerHeight: 0,
  }));

  // ── 列の横の仮想化 ──
  const centerEntries = () => paneLayout().center.entries;
  const columnVirtualizer = createColumnVirtualizer<HTMLDivElement>(() => {
    const entries = centerEntries();
    return {
      horizontal: true,
      count: entries.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index: number) => entries[index]?.paneLocalSize ?? entries[index]?.column.width ?? 120,
      overscan: 8,
      scrollMargin: paneResolution().leftPaneTotalWidth,
    };
  });
  const centerRenderEntries = createMemo(() => {
    const entries = centerEntries();
    return columnVirtualizer
      .items()
      .map((item) => entries[item.index])
      .filter((entry): entry is PaneColumnEntry<T> => Boolean(entry));
  });
  const columnMeasurements = createMemo(() =>
    buildColumnMeasurements(visibleColumns(), paneResolution().effectiveColumnWidths),
  );

  // ── アクティブセル / 編集中のセルの位置 ──
  const resolveCellPlacement = (cell: CellCoord | null): { pane: ColumnPane; rect: OverlayRect } | null => {
    if (!cell || cell.row < 0 || cell.row >= viewRowCount()) {
      return null;
    }
    const single = computeSinglePaneColumnExtent(paneLayout(), cell.col);
    if (!single) {
      return null;
    }
    const metrics = vertical().rowMetrics;
    return {
      pane: single.pane,
      rect: {
        left: single.extent.start,
        top: metrics.rowTop(cell.row),
        width: single.extent.width,
        height: metrics.cellHeight(cell.row),
      },
    };
  };
  const activeCellPlacement = createMemo(() => resolveCellPlacement(ui().activeCell));
  const editingCellPlacement = createMemo(() => resolveCellPlacement(ui().editingCell));
  const selectionExtents = createMemo(() => resolveSelectionExtents(ui().selection, paneLayout(), viewRowCount()));
  const selectionBand = createMemo(() =>
    resolveSelectionBand(selectionExtents(), vertical().windowFirstRow, vertical().windowLastRow, vertical().rowMetrics),
  );
  const selectionRectForPane = (pane: ColumnPane): OverlayRect | null => {
    const extents = selectionExtents();
    const band = selectionBand();
    const extent = extents?.extents[pane];
    if (!extent || !band) {
      return null;
    }
    return { left: extent.start, top: band.top, width: extent.width, height: band.height };
  };

  // アクティブセルをキーで動かしたときに見える範囲へスクロールする(core の viewportSyncController)。
  const viewportSync = createViewportSyncController<T>();
  const scaleAnchor = createScrollScaleAnchor();
  connectController(
    {
      update: (verticalScaleFactor: number) => {
        scaleAnchor.update(scrollContainerRef.current, verticalScaleFactor, (scrollTop) => {
          engine.scrollSync.markApiScroll();
          setView({ scrollTop });
        });
      },
    },
    () => vertical().verticalScaleFactor,
  );
  connectController(
    viewportSync,
    () => ({
      scrollElement: scrollContainerRef.current,
      columnVirtualizer: columnVirtualizer.instance,
      columnMeasurements: columnMeasurements(),
      totalScrollWidth: paneResolution().totalScrollWidth,
      physicalBodyHeight: vertical().physicalBodyHeight,
      headerHeight: headerHeight(),
      leftPaneWidth: paneResolution().leftPaneTotalWidth,
      rightPaneWidth: paneResolution().rightPaneTotalWidth,
      centerLeadingWidth: paneResolution().centerLeadingWidth,
      activeCellRect: activeCellPlacement()?.rect ?? null,
      activeCellPinned: activeCellPlacement() !== null && activeCellPlacement()?.pane !== 'center',
      activeCell: ui().activeCell,
      verticalScaleFactor: vertical().verticalScaleFactor,
      footerHeight: 0,
    }),
    'effect',
  );

  // ── ホバー ──
  connectController(engine.hoverRowNotifier, () => ({
    enableRowHover: enableRowHover(),
    isHoverControlled: false,
    onHoveredRowChange: undefined,
    setHoveredRowIndex: (value: number | null) => setView({ hoveredRowIndex: value }),
  }));
  const setHoveredColumnIndex = (value: number | null) => setView({ hoveredColumnIndex: value });
  const setEditorInitialValue = (value: string) => setView({ editorInitialValue: value });

  // ── 元に戻す(履歴) ──
  const history = createHistoryController<T>();
  connectController(history, () => ({
    rows: rows(),
    selection: ui().selection,
    activeCell: ui().activeCell,
    onRowsChange: props.onRowsChange,
    dispatch,
    enabled: (props.enableUndoRedo ?? true) && !readOnly(),
    limit: props.undoHistoryLimit ?? 100,
    onAfterRestore: (activeCell: CellCoord | null) => {
      if (activeCell) {
        requestAnimationFrame(() => engine.gridApi.scrollToCellInternal(activeCell.row, activeCell.col, 'auto'));
      }
    },
    rowKeyGetter: props.rowKeyGetter,
  }));
  const handleRowsChange = (nextRows: T[]) => {
    if (props.onRowsChange) {
      history.handleRowsChange(nextRows);
    }
  };

  // ── コピー / 貼り付け ──
  const clipboard = createClipboardController<T>();
  connectController(clipboard, () => ({
    rows: rows(),
    rowModel: rowModel(),
    columns: columns(),
    visibleColumns: orderedColumns(),
    uiState: ui(),
    // イベントの時点の状態は store から読む(core controllers/liveUiState)。
    getUiState: store.getState,
    readOnly: readOnly(),
    canEditCell: props.canEditCell,
    rowKeyGetter: resolvedRowKeyGetter(),
    onRowsChange: props.onRowsChange ? handleRowsChange : undefined,
    dispatch,
  }));
  const isWholeGridSelected = createMemo(() =>
    computeIsWholeGridSelected(ui().selection, viewRowCount(), visibleColumns().length),
  );
  const selectEntireGrid = () => {
    if (viewRowCount() === 0 || visibleColumns().length === 0) {
      return;
    }
    dispatch(gridActions.startSelection({ row: 0, col: 0 }));
    dispatch(gridActions.updateSelection({ row: viewRowCount() - 1, col: visibleColumns().length - 1 }));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(resolveFirstDataCell(rowModel(), visibleColumns())));
  };
  const clearSelectedCells = () => {
    if (!props.onRowsChange) {
      return;
    }
    const { nextRows, changed } = clearCellsInSelection({
      rows: rows(),
      resolveSourceIndex: (viewIndex: number) => rowModel().getSourceIndex(viewIndex),
      columns: orderedColumns(),
      selection: ui().selection,
      activeCell: ui().activeCell,
      viewRowCount: viewRowCount(),
      canWriteCell: (_source: number, colIndex: number, row: T, column: UnboundGridColumn<T>, viewIndex: number) =>
        isViewCellEditable({ readOnly: readOnly(), canEditCell: props.canEditCell }, rowModel(), viewIndex, colIndex, row, column),
    });
    if (changed) {
      handleRowsChange(nextRows);
    }
  };

  // ── 編集 ──
  const edit = createEditController<T>();
  connectController(edit, () => ({
    uiState: ui(),
    rows: rows(),
    visibleColumns: orderedColumns(),
    rowModel: rowModel(),
    setEditorInitialValue,
    onRowsChange: props.onRowsChange ? handleRowsChange : undefined,
    dispatch,
    gridRootRef,
    editorActionGuardRef,
    readOnly: readOnly(),
    canEditCell: props.canEditCell,
  }));
  const tryStartEditCell = (cell: CellCoord): boolean => {
    const row = rowModel().getRow(cell.row);
    const column = orderedColumns()[cell.col];
    if (!row || !column) {
      return false;
    }
    if (!isViewCellEditable({ readOnly: readOnly(), canEditCell: props.canEditCell }, rowModel(), cell.row, cell.col, row, column)) {
      return false;
    }
    if (column.editor?.type === 'checkbox') {
      return false;
    }
    edit.startEditWithValue(cell, String(getCellValue(row, column) ?? ''));
    return true;
  };
  cellDoubleClickRef.current = (cell) => {
    tryStartEditCell(cell);
  };
  const handleCellDoubleClickFromKeyboard = (cell: CellCoord) => {
    const row = rowModel().getRow(cell.row);
    const column = orderedColumns()[cell.col];
    if (!row || !column) {
      return;
    }
    if (!isViewCellEditable({ readOnly: readOnly(), canEditCell: props.canEditCell }, rowModel(), cell.row, cell.col, row, column)) {
      return;
    }
    setEditorInitialValue(String(getCellValue(row, column) ?? ''));
    dispatch(gridActions.startEdit(cell));
  };

  // ── ポインタ(範囲選択 / 見出し / 行番号 / ダブルクリック) ──
  const pointer = createPointerInteractionsController<T>();
  connectController(pointer, () => ({
    gridRootRef,
    bodyScrollRef,
    scrollContainerRef,
    leftPaneScrollRef,
    rightPaneScrollRef,
    pointerClientRef,
    autoScrollFrameRef,
    uiState: ui(),
    // イベントの時点の状態は store から読む(core controllers/liveUiState)。
    getUiState: store.getState,
    dispatch,
    enableRangeSelection: enableRangeSelection(),
    enableSorting: enableSorting(),
    orderedColumns: orderedColumns(),
    resolveFirstDataCell: () => resolveFirstDataCell(rowModel(), visibleColumns()),
    filteredRowsLength: viewRowCount(),
    visibleColumnsLength: visibleColumns().length,
    paneLayout: paneLayout(),
    leftLeadingWidth: paneResolution().leftLeadingWidth,
    centerLeadingWidth: paneResolution().centerLeadingWidth,
    rightLeadingWidth: paneResolution().rightLeadingWidth,
    headerHeight: headerHeight(),
    footerHeight: 0,
    stickyTopHeight: 0,
    rowMetrics: vertical().rowMetrics,
    verticalScaleFactor: vertical().verticalScaleFactor,
    setHoveredRowIndex: engine.hoverRowNotifier.applyHoveredRowChange,
    setHoveredColumnIndex,
    enableRowHover: enableRowHover(),
    enableColumnHeaderHover: props.enableColumnHeaderHover ?? true,
    enableColumnHover: false,
    enableRowSelection: false,
    onGutterRowSelect: () => {},
    onGutterRowSelectDrag: () => {},
    onCellDoubleClickRef: cellDoubleClickRef,
  }));

  // ── キー操作 ──
  const keyboard = createKeyboardController<T>();
  connectController(keyboard, () => ({
    uiState: ui(),
    // イベントの時点の状態は store から読む(core controllers/liveUiState)。
    getUiState: store.getState,
    rowModel: rowModel(),
    visibleColumns: orderedColumns(),
    readOnly: readOnly(),
    canEditCell: props.canEditCell,
    setEditorInitialValue,
    dispatch,
    handleCopy: clipboard.handleCopy,
    handleCellDoubleClick: handleCellDoubleClickFromKeyboard,
    isWholeGridSelected: isWholeGridSelected(),
    selectEntireGrid,
    onUndo: history.undo,
    onRedo: history.redo,
    onClearSelection: clearSelectedCells,
    enableClearOnDelete: props.enableClearOnDelete ?? true,
    onToggleCheckboxCell: () => {},
    onToggleGroup: () => {},
  }));
  const handleShellKeyDown = (event: KeyboardEvent) => {
    keyboard.handleKeyDown({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      isComposing: isImeComposingKeyEvent(event),
      target: event.target,
      preventDefault: () => event.preventDefault(),
    });
  };

  // ── 通知(onActiveCellChange) ──
  connectController(
    engine.activeCellNotifier,
    () => ({
      activeCell: ui().activeCell,
      editingCell: ui().editingCell,
      rowModel: rowModel(),
      orderedColumns: orderedColumns(),
      onActiveCellChange: props.onActiveCellChange,
    }),
    'effect',
  );

  // ── 命令的 API(ハンドル) ──
  connectController(engine.gridApi, () => ({
    scrollContainerRef,
    dispatch,
    rowModel: rowModel(),
    viewRowCount: viewRowCount(),
    leafRowCount: viewRowCount(),
    groupTree: null,
    rowMetrics: vertical().rowMetrics,
    paneLayout: paneLayout(),
    orderedColumns: orderedColumns(),
    columns: columns(),
    onColumnsChange: undefined,
    uiState: ui(),
    getUiState: store.getState,
    focusGrid: () => gridRootRef.current?.focus({ preventScroll: true }),
    startEditCell: tryStartEditCell,
    headerHeight: headerHeight(),
    verticalScaleFactor: vertical().verticalScaleFactor,
    leftPaneTotalWidth: paneResolution().leftPaneTotalWidth,
    rightPaneTotalWidth: paneResolution().rightPaneTotalWidth,
    centerLeadingWidth: paneResolution().centerLeadingWidth,
    windowFirstRow: vertical().windowFirstRow,
    windowLastRow: vertical().windowLastRow,
    physicalBodyHeight: vertical().physicalBodyHeight,
    footerHeight: 0,
    rows: rows(),
    isServerSide: false,
    serverSideRefresh: () => {},
    serverSideRetryFailed: () => {},
    resolvedRowKeyGetter: resolvedRowKeyGetter(),
    isRowExportable: undefined,
    activeToolPanelTab: null,
    openToolPanel: () => {},
    closeToolPanel: () => {},
    find: { open: () => {}, close: () => {}, next: () => {}, prev: () => {} },
    undoRows: history.undo,
    applyRowsChange: props.onRowsChange ? history.applyRows : undefined,
    redoRows: history.redo,
    canUndoRows: history.canUndo,
    canRedoRows: history.canRedo,
    clearUndoHistory: history.clearHistory,
    detailRowEnabled: false,
    detailIsExpandable: undefined,
    detailIndexCacheRef: engine.detailIndexCache,
    moveRowByKey: () => {},
    commitRowSelection: () => {},
    markApiScroll: engine.scrollSync.markApiScroll,
  }));
  onSettled(() => {
    props.ref?.(engine.gridApi.handle);
  });
  // React 版の onPointerMoveCapture。Solid 2.0 は on: / oncapture: を無くしたので、capture のリスナーは自分で付けます
  //   (ref の中では onCleanup を使えないので、描き終わった後に付けて、外すのは onSettled の戻り値で)。
  onSettled(() => {
    const element = gridRootRef.current;
    if (!element) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      pointer.updateSelectionFromPointer(event.clientX, event.clientY);
    };
    element.addEventListener('pointermove', onMove, { capture: true });
    return () => element.removeEventListener('pointermove', onMove, { capture: true });
  });

  // ── テーマ(OS の配色の外部 store も signal にする) ──
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(systemColorSchemeStore.getSnapshot());
  onSettled(() => {
    setSystemPrefersDark(systemColorSchemeStore.getSnapshot());
    return systemColorSchemeStore.subscribe(() => setSystemPrefersDark(systemColorSchemeStore.getSnapshot()));
  });
  const themeClassName = () => resolveGridThemeClassName(props.theme ?? 'light', systemPrefersDark());
  const heightLayout = createMemo(() => resolveGridHeightLayout(props.height, props.maxHeight));

  // ── 描画の材料 ──
  const gridDomId = createUniqueId();
  const activeCellDomId = `${gridDomId}-active-cell`;
  const editingKey = createMemo(() => {
    const cell = ui().editingCell;
    return cell ? `${cell.row}:${cell.col}` : null;
  });
  const renderCellContent = (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
    state: CellRenderState,
  ): JSX.Element => {
    const unbound = column as unknown as UnboundGridColumn<T>;
    const value = getCellValue(row, unbound);
    if (column.renderCell) {
      return column.renderCell({
        row,
        rowIndex,
        sourceRowIndex: rowModel().getSourceIndex(rowIndex) ?? rowIndex,
        rowKey: rowModel().getRowKey(rowIndex) ?? rowIndex,
        colIndex,
        value,
        column,
        isActive: state.isActive,
        isSelected: state.isSelected,
        isEditing: state.isEditing,
        readOnly: state.readOnly,
        setValue: (nextValue: unknown) => {
          if (decideCellWrite(unbound, row, nextValue).action === 'reject') {
            return;
          }
          const source = rowModel().getSourceIndex(rowIndex);
          if (source === undefined || !props.onRowsChange) {
            return;
          }
          handleRowsChange(writeRowsCell(rows(), source, unbound, nextValue));
        },
      });
    }
    const text = column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');
    return <span class="ssg-cell-value">{text}</span>;
  };

  const pinnedPaneStyle = (side: 'left' | 'right', width: number, hasContent: boolean): JSX.CSSProperties => ({
    position: 'sticky',
    ...(side === 'left' ? { left: '0' } : { right: '0' }),
    width: px(width),
    'min-width': px(width),
    'flex-shrink': 0,
    'align-self': 'stretch',
    'z-index': 2,
    ...(hasContent
      ? side === 'left'
        ? { 'border-right': '1px solid var(--ssg-pane-border)', 'box-shadow': 'var(--ssg-pane-shadow-left)' }
        : { 'border-left': '1px solid var(--ssg-pane-border)', 'box-shadow': 'var(--ssg-pane-shadow-right)' }
      : {}),
  });

  // 1 つのペインの中身(見出し + 本体の層)。左 / 中央 / 右で同じ。
  const renderPane = (
    pane: ColumnPane,
    width: () => number,
    leadingWidth: () => number,
    ownsRowHeader: () => boolean,
    entries: () => readonly PaneColumnEntry<T>[],
  ) => {
    const bodyHeight = () => headerHeight() + vertical().physicalBodyHeight;
    const activeRect = () => {
      const placement = activeCellPlacement();
      return placement && placement.pane === pane ? placement.rect : null;
    };
    const editorRect = () => {
      const placement = editingCellPlacement();
      return placement && placement.pane === pane ? placement.rect : null;
    };
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'clip',
          width: px(width()),
          'min-width': px(width()),
          height: px(bodyHeight()),
        }}
      >
        <HeaderRow<T>
          pane={pane}
          ownsRowHeader={ownsRowHeader()}
          leadingWidth={leadingWidth()}
          headerHeight={headerHeight()}
          rowHeaderWidth={rowHeaderWidth()}
          entries={entries()}
          selection={selectionSnapshot()}
          isWholeGridSelected={isWholeGridSelected()}
          hoveredColumnIndex={view().hoveredColumnIndex}
          isCornerHovered={view().isCornerHovered}
          sort={ui().sort}
          onCornerPointerDown={() => selectEntireGrid()}
          onColumnHeaderPointerDown={pointer.handleColumnHeaderPointerDown}
          onColumnHeaderPointerEnter={pointer.handleColumnHeaderPointerEnter}
        />
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: px(width()),
            height: px(bodyHeight()),
            transform: vertical().bodyLayerTransform,
          }}
        >
          <Overlay
            class="ssg-selection-overlay"
            rect={selectionRectForPane(pane)}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
          />
          <Overlay
            class="ssg-active-cell-overlay"
            rect={activeRect()}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
          />
          <Show when={editorRect() !== null && editingKey()} keyed>
            {(key) => {
              const column = () => orderedColumns()[ui().editingCell?.col ?? -1];
              return (
                <div
                  class="ssg-cell-editor"
                  role="group"
                  data-editing-key={key}
                  style={{
                    position: 'absolute',
                    left: px(leadingWidth() + (editorRect()?.left ?? 0)),
                    top: px(headerHeight() + (editorRect()?.top ?? 0) - vertical().overlayBaseOffset),
                    width: px(editorRect()?.width ?? 0),
                    height: px(editorRect()?.height ?? 0),
                  }}
                >
                  <TextEditor
                    initialValue={untrack(() => view().editorInitialValue ?? store.getViewState().editorInitialValue ?? '')}
                    ariaLabel={column()?.title || column()?.key}
                    align={column()?.align}
                    enterMove={props.editorEnterMove}
                    onCommit={(value: unknown, direction?: EditorCommitDirection) => edit.commitEdit(value, direction)}
                    onCancel={edit.cancelEdit}
                  />
                </div>
              );
            }}
          </Show>
          <BodyRows<T>
            pane={pane}
            ownsRowHeader={ownsRowHeader()}
            leadingWidth={leadingWidth()}
            rowHeight={rowHeight()}
            rowHeaderWidth={rowHeaderWidth()}
            rows={vertical().virtualRows}
            entries={entries()}
            rowModel={rowModel()}
            activeCell={ui().activeCell}
            editingCell={ui().editingCell}
            selection={selectionSnapshot()}
            isWholeGridSelected={isWholeGridSelected()}
            hoveredRowIndex={view().hoveredRowIndex}
            readOnly={readOnly()}
            canEditCell={props.canEditCell}
            activeCellDomId={activeCellDomId}
            renderCellContent={renderCellContent}
            onRowHeaderPointerDown={pointer.handleRowHeaderPointerDown}
            onRowHeaderPointerEnter={pointer.handleRowHeaderPointerEnter}
            onCellPointerDown={pointer.handleCellPointerDown}
            onCellPointerEnter={pointer.handleCellPointerEnter}
            onCellDoubleClick={pointer.handleCellDoubleClick}
          />
        </div>
      </div>
    );
  };

  const activeDescendantId = () => {
    const cell = ui().activeCell;
    if (!cell || !vertical().virtualRowIndexes.has(cell.row)) {
      return undefined;
    }
    const rendered = [...paneLayout().left.entries, ...centerRenderEntries(), ...paneLayout().right.entries];
    return rendered.some((entry) => entry.logicalIndex === cell.col) ? activeCellDomId : undefined;
  };

  return (
    <div
      class={[
        'ssg-root',
        {
          [`ssg-root--density-${density()}`]: density() !== 'standard',
          'ssg-root--selecting': ui().dragState?.type === 'selection',
          'ssg-root--fill-height': heightLayout().fillParent,
        },
        themeClassName() ?? '',
        props.className ?? '',
      ]}
      style={{ ...toSolidStyle(heightLayout().rootStyle), ...props.style }}
    >
      <div
        ref={(element) => {
          gridRootRef.current = element;
        }}
        class="ssg-shell"
        tabindex={0}
        role="group"
        aria-activedescendant={activeDescendantId()}
        data-ssg-has-active-cell={ui().activeCell === null ? undefined : ''}
        onKeyDown={handleShellKeyDown}
        onPaste={(event) =>
          clipboard.handlePaste({
            clipboardData: event.clipboardData,
            preventDefault: () => event.preventDefault(),
            target: event.target,
          })
        }
        onDragStart={(event) => pointer.handleNativeDragStart(event)}
        onPointerLeave={() => engine.hoverRowNotifier.applyHoveredRowChange(null)}
      >
        <div
          ref={(element) => {
            scrollContainerRef.current = element;
          }}
          tabindex={-1}
          role="grid"
          aria-label={props.ariaLabel}
          aria-rowcount={viewRowCount() + 1}
          aria-colcount={orderedColumns().length + 1}
          aria-multiselectable={enableRangeSelection() ? 'true' : undefined}
          aria-readonly={readOnly() ? 'true' : undefined}
          class="ssg-scroll-container"
          style={toSolidStyle(heightLayout().scrollContainerStyle)}
        >
          <div
            class="ssg-inner-row"
            style={{
              width: px(paneResolution().totalScrollWidth),
              'min-width': px(paneResolution().totalScrollWidth),
              height: px(headerHeight() + vertical().physicalBodyHeight),
            }}
          >
            <div
              ref={(element) => {
                leftPaneScrollRef.current = element;
              }}
              style={pinnedPaneStyle('left', paneResolution().leftPaneTotalWidth, paneLayout().left.entries.length > 0)}
            >
              <Show when={paneResolution().hasLeftPane}>
                {renderPane(
                  'left',
                  () => paneResolution().leftPaneTotalWidth,
                  () => paneResolution().leftLeadingWidth,
                  () => true,
                  () => paneLayout().left.entries,
                )}
              </Show>
            </div>
            <div
              ref={(element) => {
                bodyScrollRef.current = element;
              }}
              class="ssg-center-pane"
              style={{
                width: px(paneResolution().centerContentWidth),
                'min-width': px(paneResolution().centerContentWidth),
              }}
            >
              {renderPane(
                'center',
                () => paneResolution().centerContentWidth,
                () => paneResolution().centerLeadingWidth,
                () => paneResolution().centerOwnsRowHeader,
                centerRenderEntries,
              )}
            </div>
            <div
              ref={(element) => {
                rightPaneScrollRef.current = element;
              }}
              style={pinnedPaneStyle('right', paneResolution().rightPaneTotalWidth, paneLayout().right.entries.length > 0)}
            >
              <Show when={paneResolution().hasRightPane}>
                {renderPane(
                  'right',
                  () => paneResolution().rightPaneTotalWidth,
                  () => paneResolution().rightLeadingWidth,
                  () => false,
                  () => paneLayout().right.entries,
                )}
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpreadsheetGrid;