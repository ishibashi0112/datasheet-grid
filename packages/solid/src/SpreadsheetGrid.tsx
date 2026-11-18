// Solid 2.0 版のシェル。React 版の GridShell.tsx を、同じ core(createGridEngine と各コントローラ)の上に Solid で
//   組み直したもの。DOM と class は React 版と同じなので、styles.css をそのまま使います。
//   段階 1 の範囲は React 版の機能なしの構成(`/lite` の createSpreadsheetGrid({ features: {} }))と同じで、
//   React 版と並べて DOM と通知を比べるテスト(src/parity/)で確かめます。
//
//   作り:
//   - 派生値は createMemo で、engine のリゾルバ(同じ入力なら同じ参照)を呼ぶだけ。React 版の useMemo の外皮と同じ並び。
//   - コントローラは connectController(primitives/controller.ts)で update を描画の段の effect から呼ぶ
//     (React 版の useControllerLifecycle。'effect' は React の passive effect)。
//   - store は primitives/gridStoreSignals.ts で signal にする(購読は onSettled の中)。
//   - 部品の本体では props を直接読まない(Solid 2.0 は本体での読み取りを警告する)。props は関数や memo の中で読む。
//   - React の onXxxCapture / onBlur / onFocus(子孫からも上がってくる)は、Solid では capture のリスナーを自分で付ける /
//     onFocusOut / onFocusIn にします。
import { Show, createEffect, createMemo, createUniqueId, onCleanup, onSettled, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type {
  CellCoord,
  EditorCommitDirection,
  GridRowKey,
  SpreadsheetGridDerivedSummary,
} from '@ishibashi0112/spreadsheet-grid-core';
import { createGridEngine } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/createGridEngine';
import type { GridColumn as UnboundGridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import { gridActions } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridActions';
import { buildSelectionSnapshot, selectGlobalFilter } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import {
  buildColumnMeasurements,
  type ColumnPane,
  type PaneColumnEntry,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import {
  resolveSelectionBand,
  resolveSelectionExtents,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionOverlayGeometry';
import {
  isActiveCellRendered,
  placementRectInPane,
  resolveCellPlacement,
  resolvePaneBandRect,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cellPlacement';
import { GRID_DENSITY_DIMENSIONS } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/density';
import { resolveGridHeightLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridHeight';
import { resolveGridThemeClassName } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/theme';
import { MOTION_OFF_CLASS_NAME, resolveGridMotion } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/motion';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/systemColorSchemeStore';
import { reducedMotionStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/reducedMotionStore';
import {
  createLocaleTextResolver,
  DEFAULT_GRID_LOCALE_TEXT,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import {
  resolveSlotMapFromSignature,
  serializeSlotValue,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/slotProps';
import {
  buildGridDerivedSummary,
  createDataColumnNamer,
  createDataRowNumberer,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridBarSummary';
import { isCheckboxChecked } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/checkboxEditor';
import { resolvePageTargetRow } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import {
  registerPopupContainer,
  resolvePopupContainer,
} from '@ishibashi0112/spreadsheet-grid-core/internal/utils/popupContainer';
import { createCellCommands, writeCellValueTo } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/cellCommands';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
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
import {
  acquireTooltipController,
  hideActiveCellTooltip,
  scheduleActiveCellTooltip,
  type TooltipController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/tooltipController';
import {
  GRID_POPUP_SELECTOR,
  createEscapeClaimController,
  isClearableSelection,
  isEscapeClaimedByGrid,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/escapeClaimController';
import type {
  GridClassNames,
  GridColumn,
  SpreadsheetGridProps,
  SpreadsheetGridSlotContext,
} from './model/gridTypes';
import { GridLocaleTextContext } from './context/localeText';
import { createGridStoreSignals } from './primitives/gridStoreSignals';
import { createExternalStoreSignal } from './primitives/externalStore';
import { createGridViewSetters } from './primitives/viewSetters';
import { connectController } from './primitives/controller';
import { createColumnVirtualizer } from './primitives/columnVirtualizer';
import { px, toSolidStyle } from './primitives/style';
import { createLiveObject } from './primitives/liveObject';
import { GridHeaderRow } from './view/GridHeaderRow';
import { GridBodyLayer, type GridBodyRowItem, type GridCellContentContext } from './view/GridBodyLayer';
import { Overlay, type OverlayRect } from './view/Overlay';
import { CheckboxCell } from './editors/CheckboxCell';
import { CellEditorLayer, type CellEditorSession } from './editors/CellEditorLayer';
import { GridPortalContext } from './context/portal';
import { DefaultGridTopBar } from './view/DefaultGridTopBar';
import { DefaultGridBottomBar } from './view/DefaultGridBottomBar';

const EMPTY_ROWS: never[] = [];
const NO_COLUMNS: never[] = [];
const NO_COLUMN_FILTERS: Record<string, never> = {};
const noopRenderDetailToggleCell = () => null;
const noop = () => {};

type MutableRef<V> = { current: V };

type EditorIdentity = { row: number; col: number; rowKey: GridRowKey | undefined; columnKey: string | undefined };
type EditorSession = { id: number; identity: EditorIdentity };

// 利用側のバーへ渡す文脈のキー(SpreadsheetGridSlotContext のすべて。足りないと型で分かる)。
const SLOT_CONTEXT_KEYS = Object.keys({
  rows: true,
  columns: true,
  visibleColumns: true,
  filteredRows: true,
  globalFilterText: true,
  setGlobalFilterText: true,
  columnFilterValues: true,
  sortState: true,
  activeCell: true,
  selection: true,
  derivedSummary: true,
  globalFilterStatus: true,
  globalFilterProgress: true,
  selectionAggregates: true,
} satisfies Record<keyof SpreadsheetGridSlotContext<unknown>, true>) as (keyof SpreadsheetGridSlotContext<unknown>)[];

export function SpreadsheetGrid<T extends object>(props: SpreadsheetGridProps<T>): JSX.Element {
  // ── props(既定値つきの読み取り。本体では読まず、関数 / memo の中で読む。既定値は React 版の GridShell と同じ) ──
  const rows = createMemo(() => (props.rows ?? EMPTY_ROWS) as T[]);
  const columns = createMemo(() => props.columns as unknown as UnboundGridColumn<T>[]);
  const density = () => props.density ?? 'standard';
  const rowHeight = () => props.rowHeight ?? GRID_DENSITY_DIMENSIONS[density()].rowHeight;
  // 機能なしの構成では固定行が無いので、列見出しの高さがそのまま見出しの帯の高さ(React 版の headerHeight)。
  const headerHeight = () => props.headerHeight ?? GRID_DENSITY_DIMENSIONS[density()].headerHeight;
  const rowHeaderWidth = () => props.rowHeaderWidth ?? 56;
  const readOnly = () => props.readOnly ?? false;
  const enableRangeSelection = () => props.enableRangeSelection ?? true;
  const enableSorting = () => props.enableSorting ?? true;
  const enableRowHover = () => props.enableRowHover ?? true;
  const enableColumnResize = () => props.enableColumnResize ?? true;
  const activeRowFollowEnabled = () => (props.activeCellFollows ?? 'position') === 'row';
  const columnInputs = () => ({
    columns: columns(),
    isServerSide: false,
    enableRowDrag: false,
    hasRowsChange: props.onRowsChange != null,
    detailToggleColumnActive: false,
    renderDetailToggleCell: noopRenderDetailToggleCell,
  });

  // ── 文言(React 版の createLocaleTextResolver(mergeFeatureLocaleDefaults(features))。機能なしなので既定の表だけ) ──
  const resolveLocaleText = createLocaleTextResolver(DEFAULT_GRID_LOCALE_TEXT);
  const localeTexts = createMemo(() => resolveLocaleText(props.localeText));

  // ── エンジン(1 回だけ作る) ──
  const engine = createGridEngine<T>({
    features: {},
    initialState: untrack(() => props.initialState),
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
  const viewSetters = createGridViewSetters(store);
  const { setHoveredColumnIndex, setIsCornerHovered, setEditorInitialValue } = viewSetters;

  // ── DOM の参照(コントローラは { current } を受ける) ──
  const gridRootRef: MutableRef<HTMLDivElement | null> = { current: null };
  const scrollContainerRef: MutableRef<HTMLDivElement | null> = { current: null };
  const bodyScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const leftPaneScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const rightPaneScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const tableExitRef: MutableRef<HTMLSpanElement | null> = { current: null };
  const pointerClientRef: MutableRef<{ x: number; y: number } | null> = { current: null };
  const autoScrollFrameRef: MutableRef<number | null> = { current: null };
  const editorActionGuardRef: MutableRef<boolean> = { current: false };
  const cellDoubleClickRef: MutableRef<(cell: CellCoord, event: MouseEvent) => void> = { current: noop };
  let tableExitFocusing = false;

  // ── ポップアップの置き場(ツールチップ / エディタのポップアップ。core utils/popupContainer) ──
  const getPopupContainer = () => resolvePopupContainer(gridRootRef.current, props.popupContainer ?? 'auto');
  // エディタのポップアップへ渡す文脈(トークンを写す元 = シェル、描く場所)。
  const portalContext = { source: () => gridRootRef.current, container: getPopupContainer };
  onSettled(() => {
    const shell = gridRootRef.current;
    return registerPopupContainer([shell, shell?.closest('.ssg-root')], getPopupContainer);
  });

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

  // 列の定義が変わったら列幅の状態を合わせる(React 版の useEffect と同じ。手で変えた幅は残す)。
  let previousColumnsForWidths: UnboundGridColumn<T>[] | null = null;
  createEffect(columns, (next) => {
    dispatch(gridActions.reconcileColumnWidths(previousColumnsForWidths, next));
    previousColumnsForWidths = next;
  });

  // ── 行(clientSide だけ。フィルター / グループ / ラベル行は機能なので無し) ──
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
  const order = () => orderResolution().order;
  const getFilteredRows = createMemo(() => {
    const currentOrder = order();
    const currentRows = rows();
    let cache: T[] | null = null;
    return () => (cache ??= Array.from(currentOrder, (sourceIndex) => currentRows[sourceIndex] as T));
  });

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
  // 描く行(React 版の GridBodyLayer が virtualRowIndexes に無い行を飛ばすのと同じ)と、対応に使う rowKey。
  const bodyRows = createMemo((): GridBodyRowItem[] => {
    const { virtualRows, virtualRowIndexes } = vertical();
    const model = rowModel();
    const items: GridBodyRowItem[] = [];
    for (const virtualRow of virtualRows) {
      if (!virtualRowIndexes.has(virtualRow.index)) {
        continue;
      }
      items.push({
        index: virtualRow.index,
        start: virtualRow.start,
        size: virtualRow.size,
        key: String(model.getRowKey(virtualRow.index) ?? virtualRow.index),
      });
    }
    return items;
  });

  // ── スクロールの同期(見える大きさ / scrollTop を view スライスへ) ──
  connectController(engine.scrollSync, () => ({
    scrollContainerRef,
    setViewState: store.setViewState,
    onScroll: props.onScroll,
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

  // ── モーション / 行の出入り(animateRows。React 版の engine.rowEnter と同じつなぎ) ──
  const prefersReducedMotion = createExternalStoreSignal(reducedMotionStore);
  const resolvedMotion = () => resolveGridMotion(props.motion ?? 'auto', prefersReducedMotion());
  const animateRowsActive = () => (props.animateRows ?? true) && resolvedMotion() === 'on';
  connectController(engine.rowEnter, () => ({
    scrollContainerRef,
    skeletonEnter: false,
    mountEnter: animateRowsActive(),
  }));

  // ── テーマ(OS の配色の外部 store も signal にする) ──
  const systemPrefersDark = createExternalStoreSignal(systemColorSchemeStore);
  const themeClassName = () => resolveGridThemeClassName(props.theme ?? 'light', systemPrefersDark());
  const heightLayout = createMemo(() => resolveGridHeightLayout(props.height, props.maxHeight));

  // ── classNames(スロット)。中身の署名が同じなら同じ表(React 版の useResolvedGridSlots と同じ) ──
  const slotSignature = createMemo(() => serializeSlotValue(props.classNames));
  const slots = createMemo(() =>
    resolveSlotMapFromSignature<keyof GridClassNames, JSX.CSSProperties>(slotSignature()),
  );

  // ── アクティブセル / 編集中のセルの位置 ──
  //   位置の解決は core logic/cellPlacement(React 版と共用)。
  const activeCellPlacement = createMemo(() =>
    resolveCellPlacement(ui().activeCell, viewRowCount(), paneLayout(), vertical().rowMetrics),
  );
  const editingCellPlacement = createMemo(() =>
    resolveCellPlacement(ui().editingCell, viewRowCount(), paneLayout(), vertical().rowMetrics),
  );
  const selectionExtents = createMemo(() => resolveSelectionExtents(ui().selection, paneLayout(), viewRowCount()));
  const selectionBand = createMemo(() =>
    resolveSelectionBand(selectionExtents(), vertical().windowFirstRow, vertical().windowLastRow, vertical().rowMetrics),
  );
  const selectionRectForPane = (pane: ColumnPane): OverlayRect | null =>
    resolvePaneBandRect(selectionExtents(), selectionBand(), pane);

  // ── ツールチップ(data-ssg-tooltip の委譲。core controllers/tooltipController) ──
  const gridDomId = createUniqueId();
  const activeCellDomId = `${gridDomId}-active-cell`;
  const cellEditorDomId = `${gridDomId}-cell-editor`;
  let tooltipController: TooltipController | null = null;
  onSettled(() => {
    const controller = acquireTooltipController();
    tooltipController = controller;
    controller.setSlot(untrack(slots).tooltip);
    return () => {
      controller.dispose();
      tooltipController = null;
    };
  });
  createEffect(
    () => slots().tooltip,
    (slot) => {
      tooltipController?.setSlot(slot);
    },
  );
  // アクティブセルのツールチップ(エラー / メモ)。キーで動かしたときも出す(React 版と同じ条件)。
  const activeCellTooltipKey = createMemo(() => {
    const active = ui().activeCell;
    return active === null || ui().editingCell !== null ? null : `${active.row}:${active.col}`;
  });
  createEffect(activeCellTooltipKey, (key) => {
    if (key === null) {
      hideActiveCellTooltip(gridRootRef.current);
      return undefined;
    }
    return scheduleActiveCellTooltip(activeCellDomId, gridRootRef.current);
  });

  // ── ホバー ──
  connectController(engine.hoverRowNotifier, () => ({
    enableRowHover: enableRowHover(),
    isHoverControlled: props.hoveredRowIndex !== undefined,
    onHoveredRowChange: props.onHoveredRowChange,
    setHoveredRowIndex: viewSetters.setHoveredRowIndex,
  }));
  const applyHoveredRowChange = engine.hoverRowNotifier.applyHoveredRowChange;
  const resolvedHoveredRowIndex = () =>
    !enableRowHover() ? null : props.hoveredRowIndex !== undefined ? props.hoveredRowIndex : view().hoveredRowIndex;

  // ── アクティブセルを動かしたときに見える範囲へスクロール(core の viewportSyncController) ──
  const viewportSync = createViewportSyncController<T>();
  const scaleAnchor = createScrollScaleAnchor();
  connectController(
    {
      update: (verticalScaleFactor: number) => {
        scaleAnchor.update(scrollContainerRef.current, verticalScaleFactor, (scrollTop) => {
          engine.scrollSync.markApiScroll();
          store.setViewState({ scrollTop });
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
      isRowFollowMove: engine.activeRowFollow.isFollowMove,
      activeCellPinned: activeCellPlacement() !== null && activeCellPlacement()?.pane !== 'center',
      activeCell: ui().activeCell,
      verticalScaleFactor: vertical().verticalScaleFactor,
      footerHeight: 0,
      stickyTopInset: undefined,
    }),
    'effect',
  );

  // ── 行の選択(段階 1-3 で props をつなぐ。今は命令的 API の確定だけ) ──
  const rowSelectionCommands = engine.rowSelectionCommands;
  connectController(rowSelectionCommands, () => ({
    rowModel: rowModel(),
    rowSelectionState: ui().rowSelection,
    rowSelectionMode: 'multiple' as const,
    onRowSelectionChange: undefined,
    controlledRowSelectionModel: undefined,
    leafRowCount: viewRowCount(),
    filteredDataRows: null,
    dispatch,
  }));

  // ── セルの通知(クリック / ダブルクリック / アクティブセル) ──
  connectController(engine.cellEventNotifier, () => ({
    rowModel: rowModel(),
    orderedColumns: orderedColumns(),
    onCellClick: props.onCellClick,
    onCellDoubleClick: props.onCellDoubleClick,
  }));
  connectController(engine.activeRowFollow, () => ({
    enabled: activeRowFollowEnabled(),
    activeCell: ui().activeCell,
    selection: ui().selection,
    rowModel: rowModel(),
    dragging: (() => {
      const drag = ui().dragState;
      return drag?.type === 'selection' && drag.selectionKind !== 'col';
    })(),
    editing: ui().editingCell !== null,
    dispatch,
  }));
  connectController(
    engine.activeCellNotifier,
    () => ({
      activeCell: ui().activeCell,
      editingCell: ui().editingCell,
      rowModel: rowModel(),
      orderedColumns: orderedColumns(),
      onActiveCellChange: props.onActiveCellChange,
      followsRow: activeRowFollowEnabled(),
      isRowFollowPending: engine.activeRowFollow.isFollowPending,
    }),
    'effect',
  );

  // ── ポインタ(範囲選択 / 見出し / 行番号 / ダブルクリック) ──
  const pointer = createPointerInteractionsController<T>();
  connectController(pointer, () => ({
    gridRootRef,
    bodyScrollRef,
    onCellDoubleClickRef: cellDoubleClickRef,
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
    setHoveredRowIndex: applyHoveredRowChange,
    setHoveredColumnIndex,
    enableRowHover: enableRowHover(),
    enableColumnHeaderHover: props.enableColumnHeaderHover ?? true,
    // クロスヘア(hoverHighlight: 'cross')は機能(motionExtras)。機能なしでは 'row' のまま。
    enableColumnHover: false,
    enableRowSelection: false,
    onGutterRowSelect: rowSelectionCommands.handleGutterRowSelect,
    onGutterRowSelectDrag: rowSelectionCommands.handleGutterRowSelectDrag,
  }));

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
    onUndoRedoStateChange: props.onUndoRedoStateChange,
    onAfterRestore: (activeCell: CellCoord | null) => {
      if (activeCell) {
        requestAnimationFrame(() => engine.gridApi.scrollToCellInternal(activeCell.row, activeCell.col, 'auto'));
      }
    },
    rowKeyGetter: props.rowKeyGetter,
  }));
  // onRowsChange が無いときは書き込まない(React 版の useGridHistoryController と同じ)。
  const handleRowsChange = () => (props.onRowsChange ? history.handleRowsChange : undefined);

  // ── セルの操作(編集の開始 / チェックボックス / 削除 / 全選択。core engine/cellCommands で React 版と共用)──
  const cells = createCellCommands<T>();
  const { selectEntireGrid, clearSelectedCells, tryStartEdit: tryStartEditCell } = cells;

  // ── コピー / 貼り付け ──
  const orderedColumnKeys = createMemo(() => orderedColumns().map((column) => column.key).join('\u0000'));
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
    onCopied: (selection: NonNullable<ReturnType<typeof store.getState>['selection']>) => {
      const state = store.getState();
      store.setViewState({
        copiedRange: {
          selection,
          view: {
            sort: state.sort,
            filters: state.filters,
            collapsedGroupKeys: state.collapsedGroupKeys,
            viewRowCount: untrack(viewRowCount),
            columns: untrack(orderedColumnKeys),
          },
        },
      });
    },
    createRow: props.createRow,
    createOverflowColumn: props.createOverflowColumn,
    onPasteSkipped: props.onPasteSkipped,
    localeTexts: localeTexts(),
    pasteFillsSelection: props.pasteFillsSelection,
    onRowsChange: handleRowsChange(),
    onColumnsChange: props.onColumnsChange,
    applyServerSideCellEdits: undefined,
    isRowExportable: props.isRowExportable,
    dispatch,
  }));
  const isWholeGridSelected = createMemo(() =>
    computeIsWholeGridSelected(ui().selection, viewRowCount(), visibleColumns().length),
  );

  // ── Tab でグリッドの外へ(最後の列の Tab / 表の外の目印 .ssg-tab-exit) ──
  const moveFocusPastTable = () => {
    const exit = tableExitRef.current;
    if (!exit) {
      return;
    }
    tableExitFocusing = true;
    try {
      exit.focus({ preventScroll: true });
    } finally {
      tableExitFocusing = false;
    }
  };
  const handleTabPastLastColumn = (): boolean => {
    moveFocusPastTable();
    return false;
  };
  const handleTableExitFocus = () => {
    if (tableExitFocusing) {
      return;
    }
    // 後ろ(グリッドの外の次の要素)から Shift+Tab で戻ってきたときはグリッドへ(展開行のカードは段階 1-3)。
    gridRootRef.current?.focus({ preventScroll: true });
  };
  const resolvePageRow = (fromRow: number, direction: 1 | -1): number => {
    const pageHeight = Math.max(view().viewportHeight - headerHeight(), rowHeight());
    return resolvePageTargetRow(vertical().rowMetrics, fromRow, direction, pageHeight);
  };

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
    openFind: undefined,
    handleCellDoubleClick: tryStartEditCell,
    isWholeGridSelected: isWholeGridSelected(),
    selectEntireGrid,
    onUndo: history.undo,
    onRedo: history.redo,
    onClearSelection: clearSelectedCells,
    enableClearOnDelete: props.enableClearOnDelete ?? true,
    onToggleCheckboxCell: cells.toggleCheckbox,
    onToggleGroup: noop,
    onToggleDetailRow: undefined,
    resolvePageRow,
    openColumnMenu: undefined,
    openContextMenu: undefined,
    onTabPastLastColumn: handleTabPastLastColumn,
  }));

  // ── 編集 ──
  const edit = createEditController<T>();
  connectController(edit, () => ({
    uiState: ui(),
    rows: rows(),
    visibleColumns: orderedColumns(),
    rowModel: rowModel(),
    setEditorInitialValue,
    onRowsChange: handleRowsChange(),
    applyServerSideCellEdits: undefined,
    dispatch,
    gridRootRef,
    editorActionGuardRef,
    readOnly: readOnly(),
    canEditCell: props.canEditCell,
    localeTexts: localeTexts(),
    followsRow: activeRowFollowEnabled(),
  }));
  connectController(cells, () => ({
    rows: rows(),
    rowModel: rowModel(),
    orderedColumns: orderedColumns(),
    uiState: ui(),
    getUiState: store.getState,
    readOnly: readOnly(),
    canEditCell: props.canEditCell,
    handleRowsChange: handleRowsChange(),
    applyServerSideCellEdits: undefined,
    startEditWithValue: edit.startEditWithValue,
    dispatch,
  }));
  // ダブルクリック: 利用側の onCellDoubleClick が preventDefault しなければ編集を始める(React 版と同じ)。
  cellDoubleClickRef.current = (cell, event) => {
    if (engine.cellEventNotifier.notifyCellDoubleClick(cell, event)) {
      return;
    }
    tryStartEditCell(cell);
  };

  // ── Escape をグリッドが使うとき、外側(ダイアログなど)へ渡さない(core controllers/escapeClaimController) ──
  //   機能なしの構成ではグリッドのポップアップ(列メニュー / フィルター / ツールパネル / 右クリックメニュー)が無い。
  const escapeClaim = createEscapeClaimController();
  connectController(escapeClaim, () => ({
    gridRootRef,
    isClaimedTarget: (target: Element, root: HTMLElement) => {
      const state = store.getState();
      if (!root.contains(target)) {
        if (target.closest(GRID_POPUP_SELECTOR) !== null) {
          return state.editingCell !== null;
        }
        return false;
      }
      if (target.closest('.ssg-cell-editor, [data-ssg-find-bar]') !== null) {
        return true;
      }
      if (target === root || target.hasAttribute('data-ssg-ime-input')) {
        return state.editingCell !== null || isClearableSelection(state.selection);
      }
      return false;
    },
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
    if (isEscapeClaimedByGrid(event)) {
      event.stopPropagation();
    }
  };

  // ── 列(並べ替え / 列幅のドラッグ。core engine/columnCommands) ──
  const columnCommands = engine.columnCommands;
  connectController(columnCommands, () => ({
    columns: columns(),
    visibleColumns: visibleColumns(),
    orderedColumns: orderedColumns(),
    columnWidths: paneResolution().effectiveColumnWidths,
    onColumnsChange: props.onColumnsChange,
    dispatch,
    enableSorting: enableSorting(),
    sort: ui().sort,
    globalFilterText: selectGlobalFilter(ui()),
    closeColumnMenu: noop,
    openToolPanel: noop,
    openColumnFilterPopover: noop,
    runAutosize: undefined,
  }));

  // ── 見出しの角 / 行番号 / 列見出しのホバー ──
  const handleCornerHeaderPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    if (viewRowCount() === 0 || visibleColumns().length === 0) {
      return;
    }
    gridRootRef.current?.focus({ preventScroll: true });
    if (isWholeGridSelected()) {
      dispatch(gridActions.clearSelection());
      dispatch(gridActions.activateCell(null));
      return;
    }
    selectEntireGrid();
  };
  const handleRowHeaderPointerLeave = (rowIndex: number) => {
    applyHoveredRowChange((current) => (current === rowIndex ? null : current));
  };
  const handleColumnHeaderPointerLeave = (colIndex: number) => {
    setHoveredColumnIndex((current) => (current === colIndex ? null : current));
  };

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
    onColumnsChange: props.onColumnsChange,
    includeGroupingInState: false,
    uiState: ui(),
    getUiState: store.getState,
    focusGrid: () => gridRootRef.current?.focus({ preventScroll: true }),
    beforeDetailRowsCollapse: undefined,
    startEditCell: tryStartEditCell,
    headerHeight: headerHeight(),
    verticalScaleFactor: vertical().verticalScaleFactor,
    leftPaneTotalWidth: paneResolution().leftPaneTotalWidth,
    rightPaneTotalWidth: paneResolution().rightPaneTotalWidth,
    centerLeadingWidth: paneResolution().centerLeadingWidth,
    windowFirstRow: vertical().windowFirstRow,
    windowLastRow: vertical().windowLastRow,
    physicalBodyHeight: vertical().physicalBodyHeight,
    measuredRowHeights: false,
    rows: rows(),
    isServerSide: false,
    serverSideRefresh: noop,
    serverSideRetryFailed: noop,
    resolvedRowKeyGetter: resolvedRowKeyGetter(),
    isRowExportable: props.isRowExportable,
    labelRowExport: undefined,
    localeTexts: localeTexts(),
    labelViewIndexes: undefined,
    totalRowExport: undefined,
    pinnedRowsExport: undefined,
    footerHeight: 0,
    stickyTopInset: undefined,
    activeToolPanelTab: null,
    openToolPanel: noop,
    closeToolPanel: noop,
    find: { open: noop, close: noop, next: noop, prev: noop },
    undoRows: history.undo,
    redoRows: history.redo,
    canUndoRows: history.canUndo,
    canRedoRows: history.canRedo,
    clearUndoHistory: history.clearHistory,
    applyRowsChange: props.onRowsChange ? history.applyRows : undefined,
    detailRowEnabled: false,
    detailIsExpandable: undefined,
    detailIndexCacheRef: engine.detailIndexCache,
    moveRowByKey: noop,
    commitRowSelection: rowSelectionCommands.commitRowSelection,
    pendingRowSelection: rowSelectionCommands.pendingRowSelection,
    markApiScroll: () => {
      viewportSync.cancelFollow();
      return engine.scrollSync.markApiScroll();
    },
  }));
  onSettled(() => {
    props.ref?.(engine.gridApi.handle);
  });

  // ── 状態の通知(onStateChange / onFiltersChange / onSortChange) ──
  connectController(
    engine.stateChangeNotifier,
    () => ({
      columnWidths: ui().columnWidths,
      filters: ui().filters,
      sort: ui().sort,
      dragState: ui().dragState,
      columns: columns(),
      collapsedGroupKeys: ui().collapsedGroupKeys,
      includeGroupingInState: false,
      onStateChange: props.onStateChange,
      onFiltersChange: props.onFiltersChange,
      onSortChange: props.onSortChange,
    }),
    'effect',
  );

  // React 版の onPointerMoveCapture / onPointerDownCapture / onKeyDownCapture。Solid 2.0 は oncapture: を無くしたので、
  //   capture のリスナーは自分で付けます(ref の中では onCleanup を使えないので、描き終わった後に付けて、外すのは
  //   onSettled の戻り値で)。
  onSettled(() => {
    const element = gridRootRef.current;
    if (!element) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      pointer.updateSelectionFromPointer(event.clientX, event.clientY);
    };
    // ポインタで操作を始めたら目印(キーボードで動かしたときだけフォーカスの枠を出す)。
    const onDown = () => element.setAttribute('data-ssg-pointer', '');
    const onKey = () => element.removeAttribute('data-ssg-pointer');
    element.addEventListener('pointermove', onMove, { capture: true });
    element.addEventListener('pointerdown', onDown, { capture: true });
    element.addEventListener('keydown', onKey, { capture: true });
    return () => {
      element.removeEventListener('pointermove', onMove, { capture: true });
      element.removeEventListener('pointerdown', onDown, { capture: true });
      element.removeEventListener('keydown', onKey, { capture: true });
    };
  });

  // ── 上下のバー(core logic/gridBarSummary の文字列。React 版の useGridBarContext と同じ) ──
  const columnNamer = createMemo(() =>
    createDataColumnNamer(orderedColumns(), {
      detail: localeTexts().detailColumnName,
      rowDrag: localeTexts().rowDragColumnName,
    }),
  );
  const rowNumberer = createDataRowNumberer(undefined);
  const slotContextBase = createMemo(() => ({
    rows: rows(),
    columns: props.columns as GridColumn<T>[],
    visibleColumns: visibleColumns() as unknown as GridColumn<T>[],
    globalFilterText: selectGlobalFilter(ui()),
    columnFilterValues: ui().filters.columnFilters,
    sortState: ui().sort,
    activeCell: ui().activeCell,
    selection: ui().selection,
  }));
  // 機能なしの構成ではフィルターが行に効かないので、状態にあっても「絞り込み: …」に数えない(React 版の filtersApplied)。
  const derivedSummary = createMemo(
    (): SpreadsheetGridDerivedSummary =>
      buildGridDerivedSummary(
        { ...slotContextBase(), globalFilterText: '', columnFilterValues: NO_COLUMN_FILTERS },
        viewRowCount(),
        undefined,
        columnNamer(),
        rowNumberer,
        localeTexts(),
      ),
  );
  const setGlobalFilterText = (value: string) => dispatch(gridActions.setGlobalFilter(value));
  const slotContext = createMemo((): SpreadsheetGridSlotContext<T> => {
    const filteredRows = getFilteredRows();
    return {
      ...slotContextBase(),
      get filteredRows() {
        return filteredRows();
      },
      setGlobalFilterText,
      derivedSummary: derivedSummary(),
      globalFilterStatus: 'idle',
      globalFilterProgress: 1,
      selectionAggregates: null,
    };
  });
  // 利用側のバー(renderTopBar / renderBottomBar)へ渡す文脈。値は読んだときに引く形にして、バーの関数は 1 回だけ呼ぶ
  //   (状態が変わるたびに呼び直すとバーの要素が作り直され、バーの入力欄のフォーカスと打ちかけの文字が消える。React は
  //   要素を使い回す)。値は JSX の中や関数の中で読めば追従する(Solid の props と同じ)。
  const liveSlotContext = createLiveObject(SLOT_CONTEXT_KEYS, slotContext);
  //   関数は memo で受ける(親が props を広げ直しても、同じ関数ならバーを作り直さない)。
  const renderTopBarFn = createMemo(() => props.renderTopBar);
  const renderBottomBarFn = createMemo(() => props.renderBottomBar);
  const customTopBar = createMemo(() => {
    const render = renderTopBarFn();
    return render ? untrack(() => render(liveSlotContext)) : undefined;
  });
  const customBottomBar = createMemo(() => {
    const render = renderBottomBarFn();
    return render ? untrack(() => render(liveSlotContext)) : undefined;
  });
  const showTopBarSummary = () => props.showTopBarSummary ?? true;
  // 上下のバー(React 版と同じ選び方: 出さない → 利用側のバー → 既定のバー)。条件は Show で分け、条件が変わったときだけ
  //   作り直す(props が広げ直されても既定のバーを作り直さない)。
  const topBar = () => (
    <Show when={props.showTopBar ?? true}>
      <Show
        when={renderTopBarFn() !== undefined}
        fallback={
          <Show when={showTopBarSummary()}>
            <DefaultGridTopBar
              slot={slots().toolbar}
              derivedSummary={derivedSummary()}
              showSummary={showTopBarSummary()}
              showCounts={props.showTopBarCounts ?? true}
            />
          </Show>
        }
      >
        {customTopBar()}
      </Show>
    </Show>
  );
  const bottomBar = () => (
    <Show when={props.showBottomBar ?? true}>
      <Show
        when={renderBottomBarFn() !== undefined}
        fallback={
          <DefaultGridBottomBar
            slot={slots().statusBar}
            derivedSummary={derivedSummary()}
            showCounts={props.showBottomBarCounts ?? true}
          />
        }
      >
        {customBottomBar()}
      </Show>
    </Show>
  );

  // ── 描画の材料 ──
  // 編集のセッション(エディタを作り直す単位。React 版の CellEditorLayer と同じ決め方): 編集が始まったとき、または
  //   位置と行 / 列のキーが両方変わったとき(閉じずに別のセルの編集が始まった)に新しくする。編集中に rows が変わって行の
  //   位置だけが動いたとき(上に行が足された / 並びが変わった)は同じセッションのまま(打ちかけの文字を残す)。
  const editorSession = createMemo((previous?: EditorSession | null): EditorSession | null => {
    const cell = ui().editingCell;
    if (cell === null) {
      return null;
    }
    const identity: EditorIdentity = {
      row: cell.row,
      col: cell.col,
      rowKey: rowModel().getRowKey(cell.row),
      columnKey: orderedColumns()[cell.col]?.key,
    };
    if (!previous) {
      return { id: 1, identity };
    }
    const moved = identity.row !== previous.identity.row || identity.col !== previous.identity.col;
    if (!moved) {
      // 同じ位置でキーだけ変わった(rows の差し替えの直後で、位置の付け替えの前)は前のキーのまま待つ。
      return previous;
    }
    const rekeyed =
      !Object.is(identity.rowKey, previous.identity.rowKey) || identity.columnKey !== previous.identity.columnKey;
    return { id: rekeyed ? previous.id + 1 : previous.id, identity };
  });
  const editorSessionId = createMemo(() => editorSession()?.id ?? null);
  // 編集中のセルの情報(行 / 位置 / 値)。エディタが select の行で決まる候補・開いたときのハイライト・custom の ctx に使う
  //   (編集中だけ非 null。React 版の GridShell の editorSession と同じ)。
  const editingSessionInfo = createMemo((): CellEditorSession<T> | null => {
    const cell = ui().editingCell;
    if (cell === null) {
      return null;
    }
    const column = orderedColumns()[cell.col];
    const model = rowModel();
    const row = model.getRow(cell.row);
    if (!column || !row) {
      return null;
    }
    return {
      row,
      rowIndex: cell.row,
      sourceRowIndex: model.getSourceIndex(cell.row) ?? cell.row,
      rowKey: model.getRowKey(cell.row) ?? cell.row,
      colIndex: cell.col,
      column: column as unknown as GridColumn<T>,
      value: getCellValue(row, column),
    };
  });
  // ポップアップ(select の候補の一覧)へ付ける修飾子(テーマ + モーション。React 版の portalClassName)。
  const portalClassName = () =>
    [themeClassName(), resolvedMotion() === 'off' ? MOTION_OFF_CLASS_NAME : undefined].filter(Boolean).join(' ') || undefined;
  // renderCell の ctx.setValue: 呼ばれた時点で、描いた行のキーから今の位置を引き直して書く(React 版は描き直しのたびに
  //   描いた時点の rows / rowModel を渡す。Solid 版は中身を作り直さないので、今の値と行のキーで同じ行へ書く)。
  //   行が消えていれば書かない。
  const writeRenderedCellValue = (rowKey: GridRowKey, column: UnboundGridColumn<T>, nextValue: unknown) => {
    const viewIndex = engine.gridApi.handle.getViewRowIndex(rowKey);
    if (viewIndex < 0) {
      return;
    }
    const model = untrack(rowModel);
    const row = model.getRow(viewIndex);
    if (row === undefined) {
      return;
    }
    writeCellValueTo(
      { rows: untrack(rows), rowModel: model, handleRowsChange: untrack(handleRowsChange), applyServerSideCellEdits: undefined },
      viewIndex,
      row,
      column,
      nextValue,
    );
  };
  // セルの中身。行と列が変わったときだけ作り直す(行の位置とアクティブ / 選択などの状態は cell から読んだときに引く)。
  //   行の並び(rowModel)や rows そのものは読まない(1 セルの編集で表のすべての renderCell を作り直さないように)。
  //   renderCell の本体で位置や状態を読めば、それが変わったときにその列のセルだけ作り直す(React で毎回呼ぶのと同じ結果)。
  const renderCellContent = (row: T, column: GridColumn<T>, cell: GridCellContentContext): JSX.Element => {
    const unbound = column as unknown as UnboundGridColumn<T>;
    const value = getCellValue(row, unbound);
    if (column.renderCell) {
      return column.renderCell({
        row,
        get rowIndex() {
          return cell.rowIndex;
        },
        get sourceRowIndex() {
          return cell.sourceRowIndex;
        },
        rowKey: cell.rowKey,
        get colIndex() {
          return cell.colIndex;
        },
        value,
        column,
        get isActive() {
          return cell.isActive;
        },
        get isSelected() {
          return cell.isSelected;
        },
        get isEditing() {
          return cell.isEditing;
        },
        get readOnly() {
          return cell.readOnly;
        },
        setValue: (nextValue: unknown) => writeRenderedCellValue(cell.rowKey, unbound, nextValue),
      });
    }
    if (column.editor?.type === 'checkbox') {
      const editor = column.editor;
      return (
        <CheckboxCell
          slot={slots().checkbox}
          label={column.title || column.key}
          checked={isCheckboxChecked(value, editor)}
          readOnly={cell.readOnly}
          onToggle={() => cells.toggleCheckbox({ row: cell.rowIndex, col: cell.colIndex })}
        />
      );
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
    const activeRect = () => placementRectInPane(activeCellPlacement(), pane);
    const editorRect = () => placementRectInPane(editingCellPlacement(), pane);
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
        <GridHeaderRow<T>
          pane={pane}
          ownsRowHeader={ownsRowHeader()}
          leadingWidth={leadingWidth()}
          headerHeight={headerHeight()}
          rowHeaderWidth={rowHeaderWidth()}
          slots={slots()}
          isCornerHovered={view().isCornerHovered}
          isWholeGridSelected={isWholeGridSelected()}
          showSelectAllCheckbox={false}
          selectAllState="none"
          filteredRowsLength={viewRowCount()}
          visibleColumnsLength={visibleColumns().length}
          entries={entries()}
          hoveredColumnIndex={view().hoveredColumnIndex}
          selection={selectionSnapshot()}
          // 機能なしの構成ではフィルターが行に効かないので、見出しのフィルター中の印も出さない(React 版と同じ)。
          columnFilterValues={NO_COLUMN_FILTERS}
          sort={ui().sort}
          enableColumnResize={enableColumnResize()}
          onCornerPointerDown={handleCornerHeaderPointerDown}
          onCornerPointerEnter={() => setIsCornerHovered(true)}
          onCornerPointerLeave={() => setIsCornerHovered(false)}
          onColumnHeaderPointerDown={pointer.handleColumnHeaderPointerDown}
          onColumnHeaderPointerEnter={pointer.handleColumnHeaderPointerEnter}
          onColumnHeaderPointerLeave={handleColumnHeaderPointerLeave}
          onColumnResizePointerDown={(column, event) =>
            columnCommands.handleColumnResizePointerDown(column as unknown as UnboundGridColumn<T>, event)
          }
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
            slot={slots().selectionOverlay}
            rect={selectionRectForPane(pane)}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
          />
          <Overlay
            class="ssg-active-cell-overlay"
            slot={slots().activeCellOverlay}
            rect={activeRect()}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
          />
          <CellEditorLayer<T>
            rect={editorRect()}
            sessionId={editorSessionId()}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
            initialValue={() => view().editorInitialValue ?? store.getViewState().editorInitialValue ?? ''}
            session={editingSessionInfo()}
            themeClassName={portalClassName()}
            slots={slots()}
            onCommit={(value: unknown, direction?: EditorCommitDirection) => edit.commitEdit(value, direction)}
            onCancel={edit.cancelEdit}
            align={editingSessionInfo()?.column.align}
            enterMove={props.editorEnterMove}
            domId={cellEditorDomId}
            // 上にそろえたセル(auto-height の背の高い行)は機能(autoHeight)なので、段階 1 では常に false(React 版の機能なしと同じ)。
            alignTop={false}
          />
          <GridBodyLayer<T>
            pane={pane}
            ownsRowHeader={ownsRowHeader()}
            leadingWidth={leadingWidth()}
            rowHeight={rowHeight()}
            rowHeaderWidth={rowHeaderWidth()}
            rows={bodyRows()}
            entries={entries()}
            rowModel={rowModel()}
            ariaRowOffset={0}
            activeCell={ui().activeCell}
            editingCell={ui().editingCell}
            selection={selectionSnapshot()}
            isWholeGridSelected={isWholeGridSelected()}
            hoveredRowIndex={resolvedHoveredRowIndex()}
            enableRowSelection={false}
            rowSelectionState={ui().rowSelection}
            readOnly={readOnly()}
            canEditCell={props.canEditCell}
            showValidationMarks={props.showValidationMarks ?? true}
            showCellOverflowTooltip={props.showCellOverflowTooltip ?? false}
            getRowClassName={props.getRowClassName}
            slots={slots()}
            activeCellDomId={activeCellDomId}
            cellEditorDomId={cellEditorDomId}
            renderCellContent={renderCellContent}
            onRowHeaderPointerDown={pointer.handleRowHeaderPointerDown}
            onRowHeaderPointerEnter={pointer.handleRowHeaderPointerEnter}
            onRowHeaderPointerLeave={handleRowHeaderPointerLeave}
            onCellPointerDown={pointer.handleCellPointerDown}
            onCellPointerEnter={pointer.handleCellPointerEnter}
            onCellClick={engine.cellEventNotifier.handleCellClick}
            onCellDoubleClick={pointer.handleCellDoubleClick}
          />
        </div>
      </div>
    );
  };

  // aria-activedescendant は参照先のセルが描かれているときだけ(core logic/cellPlacement。React 版と共用)。
  const activeDescendantId = () =>
    isActiveCellRendered(ui().activeCell, vertical().virtualRowIndexes, rowModel(), [
      paneLayout().left.entries,
      centerRenderEntries(),
      paneLayout().right.entries,
    ])
      ? activeCellDomId
      : undefined;

  const emptyStateText = () =>
    rows().length === 0
      ? (props.noRowsText ?? localeTexts().noRows)
      : (props.noMatchingRowsText ?? localeTexts().noMatchingRows);

  return (
    <GridLocaleTextContext value={localeTexts}>
      <GridPortalContext value={portalContext}>
      <div
        class={[
          'ssg-root',
          themeClassName(),
          slots().root?.className,
          props.className,
          {
            [`ssg-root--density-${density()}`]: density() !== 'standard',
            [MOTION_OFF_CLASS_NAME]: resolvedMotion() === 'off',
            'ssg-root--selecting': ui().dragState?.type === 'selection',
            'ssg-root--animate-rows': animateRowsActive(),
            'ssg-root--dim-readonly': props.dimReadOnlyCells ?? false,
            'ssg-root--fill-height': heightLayout().fillParent,
          },
        ]}
        style={{ ...toSolidStyle(heightLayout().rootStyle), ...slots().root?.style, ...props.style }}
      >
        {topBar()}
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
          onPointerLeave={() => applyHoveredRowChange(null)}
          onFocusOut={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null) && document.hasFocus()) {
              event.currentTarget.removeAttribute('data-ssg-pointer');
            }
          }}
        >
          <div
            ref={(element) => {
              scrollContainerRef.current = element;
            }}
            tabindex={-1}
            onFocusIn={(event) => {
              if (event.target === event.currentTarget) {
                gridRootRef.current?.focus({ preventScroll: true });
              }
            }}
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
            <Show when={viewRowCount() === 0}>
              <div class={['ssg-empty-state', slots().emptyState?.className]} style={slots().emptyState?.style}>
                {emptyStateText()}
              </div>
            </Show>
          </div>
          <span
            ref={(element) => {
              tableExitRef.current = element;
            }}
            class="ssg-tab-exit"
            tabindex={-1}
            aria-hidden="true"
            onFocus={handleTableExitFocus}
          />
        </div>
        {bottomBar()}
      </div>
      </GridPortalContext>
    </GridLocaleTextContext>
  );
}

export default SpreadsheetGrid;