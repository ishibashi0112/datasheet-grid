// 追加(非依存化 ③-17): セル / 行ヘッダー / 列ヘッダーのポインタ操作(クリック選択・ドラッグ範囲選択・
//   端 auto-scroll・タッチのタップ確定 / ダブルタップ・Shift+クリックの複数ソート)のコントローラです
//   (React 非依存。旧 hooks/useGridPointerInteractions の本体を移設)。
//   - window の pointermove / pointerup / pointercancel は最初の update で付け、dispose で外します
//     (仮想化 DOM 上のドラッグは要素直付けにしない作法。CLAUDE.md 参照)。
//   - 範囲選択ドラッグ中(dragState.type === 'selection')だけ端 auto-scroll の rAF ループを回します
//     (update で dragState の遷移を検出して開始 / 停止)。ガター行選択ドラッグは別ループ。
//   - 引数の ref(スクロール要素 / ポインタ位置 / rAF id / ダブルクリックのコールバック)は本体と共有する
//     latest-ref のため { current } の構造的型で受けます。イベントも構造的型(React 合成イベントを
//     そのまま渡せます)。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { CellCoord, GridColumn, GridUiState } from '../model/gridTypes.unbound';
import { nextSortEntries } from '../logic/sorting';
import { isSyntheticColumnKey } from '../logic/detailRow';
import {
  clamp,
  findLogicalIndexFromPaneOffset,
  type GridPaneLayout,
} from '../logic/geometry';
import { clientYToRowIndex, type RowMetrics } from '../logic/verticalGeometry';
import {
  AUTO_SCROLL_ACTIVATION_DISTANCE,
  AUTO_SCROLL_EDGE_THRESHOLD,
  AUTO_SCROLL_STEP,
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from '../logic/autoScrollGeometry';

// タッチのタップ確定: pointerdown から pointerup までの許容移動量(px)と、ダブルタップ判定の間隔(ms)。
export const TOUCH_TAP_SLOP_PX = 10;
export const TOUCH_DOUBLE_TAP_MS = 300;

type MutableRef<V> = { current: V };
type ReadonlyRef<V> = { readonly current: V };

export type GridPointerEventLike = {
  button: number;
  pointerType: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  preventDefault: () => void;
};

type PendingTouchTap = {
  pointerId: number;
  x: number;
  y: number;
  target:
    | { kind: 'cell'; cell: CellCoord }
    | { kind: 'row'; rowIndex: number }
    | { kind: 'col'; colIndex: number };
};

export type PointerInteractionsArgs<T> = {
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  bodyScrollRef: ReadonlyRef<HTMLElement | null>;
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  leftPaneScrollRef: ReadonlyRef<HTMLElement | null>;
  rightPaneScrollRef: ReadonlyRef<HTMLElement | null>;
  // 本体と共有する最新ポインタ位置 / auto-scroll の rAF id。
  pointerClientRef: MutableRef<{ x: number; y: number } | null>;
  autoScrollFrameRef: MutableRef<number | null>;
  uiState: GridUiState;
  dispatch: (action: GridUiAction) => void;
  enableRangeSelection: boolean;
  enableSorting: boolean;
  orderedColumns: GridColumn<T>[];
  filteredRowsLength: number;
  visibleColumnsLength: number;
  paneLayout: GridPaneLayout<T>;
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  headerHeight: number;
  rowMetrics: RowMetrics;
  verticalScaleFactor: number;
  setHoveredRowIndex: (value: number | null) => void;
  setHoveredColumnIndex: (value: number | null) => void;
  enableRowHover: boolean;
  enableColumnHeaderHover: boolean;
  enableRowSelection: boolean;
  onGutterRowSelect: (viewIndex: number, opts: { shiftKey: boolean }) => void;
  onGutterRowSelectDrag: (viewIndex: number) => void;
  onCellDoubleClickRef: ReadonlyRef<(cell: CellCoord) => void>;
};

export type PointerInteractionsController<T> = {
  update: (args: PointerInteractionsArgs<T>) => void;
  updateSelectionFromPointer: (clientX: number, clientY: number) => void;
  handleCellPointerDown: (cell: CellCoord, event: GridPointerEventLike) => void;
  handleCellDoubleClick: (cell: CellCoord) => void;
  handleCellPointerEnter: (cell: CellCoord, event: GridPointerEventLike) => void;
  handleNativeDragStart: (event: { preventDefault: () => void }) => void;
  handleRowHeaderPointerDown: (rowIndex: number, event: GridPointerEventLike) => void;
  handleRowHeaderPointerEnter: (rowIndex: number, event: GridPointerEventLike) => void;
  handleColumnHeaderPointerDown: (colIndex: number, event: GridPointerEventLike) => void;
  handleColumnHeaderPointerEnter: (colIndex: number, event: GridPointerEventLike) => void;
  dispose: () => void;
};

export const createPointerInteractionsController = <T,>(): PointerInteractionsController<T> => {
  let args: PointerInteractionsArgs<T> | null = null;
  let listenersAttached = false;
  let rowSelectionDragging = false;
  let pendingTouchTap: PendingTouchTap | null = null;
  let lastTouchTap: { cell: CellCoord; time: number } | null = null;
  let lastPointerType = 'mouse';
  let gutterAutoScrollFrame: number | null = null;
  let autoScrollOrigin: { x: number; y: number } | null = null;
  let autoScrollArmed = false;
  let selectionAutoScrollActive = false;

  const dragState = () => args?.uiState.dragState ?? null;

  // クライアント座標 → セル座標(3 ペインのヒットテスト。行は縦ジオメトリへ委譲)。
  const getCellCoordFromClientPoint = (clientX: number, clientY: number): CellCoord | null => {
    if (args === null) {
      return null;
    }
    const {
      bodyScrollRef,
      scrollContainerRef,
      leftPaneScrollRef,
      rightPaneScrollRef,
      filteredRowsLength,
      visibleColumnsLength,
      paneLayout,
      leftLeadingWidth,
      centerLeadingWidth,
      rightLeadingWidth,
      headerHeight,
      rowMetrics,
      verticalScaleFactor,
    } = args;
    const centerEl = bodyScrollRef.current;
    if (!centerEl || filteredRowsLength === 0 || visibleColumnsLength === 0) {
      return null;
    }
    const centerRect = centerEl.getBoundingClientRect();
    const y = centerEl.scrollTop + clientY - centerRect.top - headerHeight;
    const row = clientYToRowIndex(
      y,
      scrollContainerRef.current?.scrollTop ?? 0,
      verticalScaleFactor,
      rowMetrics,
    );

    let col: number | null = null;
    const leftEl = leftPaneScrollRef.current;
    if (col === null && leftEl && paneLayout.left.entries.length > 0) {
      const leftRect = leftEl.getBoundingClientRect();
      if (clientX < leftRect.right) {
        const localX = clientX - leftRect.left - leftLeadingWidth;
        col = findLogicalIndexFromPaneOffset(paneLayout.left, localX);
      }
    }
    const rightEl = rightPaneScrollRef.current;
    if (col === null && rightEl && paneLayout.right.entries.length > 0) {
      const rightRect = rightEl.getBoundingClientRect();
      if (clientX >= rightRect.left) {
        const localX = clientX - rightRect.left - rightLeadingWidth;
        col = findLogicalIndexFromPaneOffset(paneLayout.right, localX);
      }
    }
    if (col === null && paneLayout.center.entries.length > 0) {
      const localX = centerEl.scrollLeft + clientX - centerRect.left - centerLeadingWidth;
      col = findLogicalIndexFromPaneOffset(paneLayout.center, Math.max(localX, 0));
    }
    if (col === null) {
      return null;
    }
    return { row, col: clamp(col, 0, visibleColumnsLength - 1) };
  };

  const updateSelectionFromPointer = (clientX: number, clientY: number) => {
    const current = dragState();
    if (args === null || !current || current.type !== 'selection') {
      return;
    }
    const cell = getCellCoordFromClientPoint(clientX, clientY);
    if (!cell) {
      return;
    }
    if (current.selectionKind === 'cell') {
      args.dispatch(gridActions.updateSelection(cell));
      return;
    }
    if (current.selectionKind === 'row') {
      args.dispatch(gridActions.updateRowSelection(cell.row));
      return;
    }
    if (current.selectionKind === 'col') {
      args.dispatch(gridActions.updateColumnSelection(cell.col));
    }
  };

  // タッチのタップ確定(pointerup 時)。同一セルの連続タップはダブルクリック相当。
  const commitTouchTap = (pending: PendingTouchTap, time: number) => {
    if (args === null) {
      return;
    }
    const { gridRootRef, dispatch, enableRangeSelection, enableRowSelection, onGutterRowSelect, onCellDoubleClickRef } = args;
    gridRootRef.current?.focus({ preventScroll: true });
    const { target } = pending;
    if (target.kind === 'cell') {
      const last = lastTouchTap;
      if (
        last &&
        last.cell.row === target.cell.row &&
        last.cell.col === target.cell.col &&
        time - last.time < TOUCH_DOUBLE_TAP_MS
      ) {
        lastTouchTap = null;
        onCellDoubleClickRef.current(target.cell);
        return;
      }
      lastTouchTap = { cell: target.cell, time };
      dispatch(gridActions.activateCell(target.cell));
      if (enableRangeSelection) {
        dispatch(gridActions.startSelection(target.cell));
        dispatch(gridActions.endSelection());
      }
      return;
    }
    lastTouchTap = null;
    if (target.kind === 'row') {
      if (enableRowSelection) {
        onGutterRowSelect(target.rowIndex, { shiftKey: false });
        return;
      }
      dispatch(gridActions.startRowSelection(target.rowIndex));
      dispatch(gridActions.endSelection());
      return;
    }
    dispatch(gridActions.startColumnSelection(target.colIndex));
    dispatch(gridActions.endSelection());
  };

  const endAllDrags = () => {
    if (args === null) {
      return;
    }
    rowSelectionDragging = false;
    args.dispatch(gridActions.endSelection());
    args.dispatch(gridActions.endColumnResize());
  };

  const handleWindowPointerMove = (event: PointerEvent) => {
    if (args === null) {
      return;
    }
    args.pointerClientRef.current = { x: event.clientX, y: event.clientY };
    if (dragState()?.type === 'columnResize') {
      args.dispatch(gridActions.updateColumnResize(event.clientX));
    }
  };
  const handleWindowPointerUp = (event: PointerEvent) => {
    const pending = pendingTouchTap;
    if (pending) {
      pendingTouchTap = null;
      if (
        event.pointerId === pending.pointerId &&
        Math.abs(event.clientX - pending.x) < TOUCH_TAP_SLOP_PX &&
        Math.abs(event.clientY - pending.y) < TOUCH_TAP_SLOP_PX
      ) {
        commitTouchTap(pending, event.timeStamp);
      }
    }
    endAllDrags();
  };
  const handleWindowPointerCancel = () => {
    pendingTouchTap = null;
    endAllDrags();
  };

  const attachListeners = () => {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
  };
  const detachListeners = () => {
    if (!listenersAttached) {
      return;
    }
    listenersAttached = false;
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    window.removeEventListener('pointercancel', handleWindowPointerCancel);
  };

  // 範囲選択ドラッグ中の端 auto-scroll(rAF ループ。押下位置から一定距離動くまで armed しない)。
  const stopSelectionAutoScroll = () => {
    selectionAutoScrollActive = false;
    if (args !== null && args.autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(args.autoScrollFrameRef.current);
      args.autoScrollFrameRef.current = null;
    }
  };
  const selectionAutoScrollTick = () => {
    if (args === null || !selectionAutoScrollActive) {
      return;
    }
    const { scrollContainerRef, pointerClientRef, autoScrollFrameRef } = args;
    const scrollElement = scrollContainerRef.current;
    const pointer = pointerClientRef.current;
    if (!scrollElement || !pointer) {
      autoScrollFrameRef.current = requestAnimationFrame(selectionAutoScrollTick);
      return;
    }
    if (!autoScrollArmed) {
      const origin = autoScrollOrigin;
      if (origin && !hasPointerLeftActivationRadius(origin, pointer, AUTO_SCROLL_ACTIVATION_DISTANCE)) {
        autoScrollFrameRef.current = requestAnimationFrame(selectionAutoScrollTick);
        return;
      }
      autoScrollArmed = true;
    }
    const rect = scrollElement.getBoundingClientRect();
    const contentBox = resolveScrollContentBox({
      rectLeft: rect.left,
      rectTop: rect.top,
      clientLeft: scrollElement.clientLeft,
      clientTop: scrollElement.clientTop,
      clientWidth: scrollElement.clientWidth,
      clientHeight: scrollElement.clientHeight,
    });
    const current = dragState();
    const isColumnSelection = current?.type === 'selection' && current.selectionKind === 'col';
    const isRowSelection = current?.type === 'selection' && current.selectionKind === 'row';
    const verticalDirection = isColumnSelection
      ? 0
      : resolveAutoScrollAxisDirection(pointer.y, contentBox.top, contentBox.bottom, AUTO_SCROLL_EDGE_THRESHOLD);
    const horizontalDirection = isRowSelection
      ? 0
      : resolveAutoScrollAxisDirection(pointer.x, contentBox.left, contentBox.right, AUTO_SCROLL_EDGE_THRESHOLD);
    const nextScrollTop = computeNextScrollPosition(
      scrollElement.scrollTop,
      verticalDirection,
      AUTO_SCROLL_STEP,
      scrollElement.scrollHeight - scrollElement.clientHeight,
    );
    const nextScrollLeft = computeNextScrollPosition(
      scrollElement.scrollLeft,
      horizontalDirection,
      AUTO_SCROLL_STEP,
      scrollElement.scrollWidth - scrollElement.clientWidth,
    );
    if (nextScrollTop !== scrollElement.scrollTop || nextScrollLeft !== scrollElement.scrollLeft) {
      scrollElement.scrollTo({ top: nextScrollTop, left: nextScrollLeft, behavior: 'auto' });
      updateSelectionFromPointer(pointer.x, pointer.y);
    }
    autoScrollFrameRef.current = requestAnimationFrame(selectionAutoScrollTick);
  };
  const syncSelectionAutoScroll = () => {
    const active = dragState()?.type === 'selection';
    if (active && !selectionAutoScrollActive) {
      selectionAutoScrollActive = true;
      if (args !== null) {
        args.autoScrollFrameRef.current = requestAnimationFrame(selectionAutoScrollTick);
      }
    } else if (!active && selectionAutoScrollActive) {
      stopSelectionAutoScroll();
    }
  };

  // ガター行選択ドラッグ中の縦 auto-scroll(別ループ。行選択ドラッグが終わると自己停止)。
  const startGutterRowSelectionAutoScroll = () => {
    if (gutterAutoScrollFrame !== null) {
      return;
    }
    const tick = () => {
      if (!rowSelectionDragging || args === null) {
        gutterAutoScrollFrame = null;
        return;
      }
      const { scrollContainerRef, pointerClientRef, onGutterRowSelectDrag } = args;
      const scrollElement = scrollContainerRef.current;
      const pointer = pointerClientRef.current;
      if (!scrollElement || !pointer) {
        gutterAutoScrollFrame = requestAnimationFrame(tick);
        return;
      }
      if (!autoScrollArmed) {
        const origin = autoScrollOrigin;
        if (origin && !hasPointerLeftActivationRadius(origin, pointer, AUTO_SCROLL_ACTIVATION_DISTANCE)) {
          gutterAutoScrollFrame = requestAnimationFrame(tick);
          return;
        }
        autoScrollArmed = true;
      }
      const rect = scrollElement.getBoundingClientRect();
      const contentBox = resolveScrollContentBox({
        rectLeft: rect.left,
        rectTop: rect.top,
        clientLeft: scrollElement.clientLeft,
        clientTop: scrollElement.clientTop,
        clientWidth: scrollElement.clientWidth,
        clientHeight: scrollElement.clientHeight,
      });
      const verticalDirection = resolveAutoScrollAxisDirection(
        pointer.y,
        contentBox.top,
        contentBox.bottom,
        AUTO_SCROLL_EDGE_THRESHOLD,
      );
      const nextScrollTop = computeNextScrollPosition(
        scrollElement.scrollTop,
        verticalDirection,
        AUTO_SCROLL_STEP,
        scrollElement.scrollHeight - scrollElement.clientHeight,
      );
      if (nextScrollTop !== scrollElement.scrollTop) {
        scrollElement.scrollTo({ top: nextScrollTop, left: scrollElement.scrollLeft, behavior: 'auto' });
        const cell = getCellCoordFromClientPoint(pointer.x, pointer.y);
        if (cell) {
          onGutterRowSelectDrag(cell.row);
        }
      }
      gutterAutoScrollFrame = requestAnimationFrame(tick);
    };
    gutterAutoScrollFrame = requestAnimationFrame(tick);
  };

  // pointerdown 共通の前処理(主ボタンのみ / タッチはタップ保留 / フォーカスとポインタ位置の記録)。
  //   戻り値 false = 以降の処理を行わない。
  const beginPointerDown = (event: GridPointerEventLike, target: PendingTouchTap['target']): boolean => {
    event.preventDefault();
    if (args === null || event.button !== 0) {
      return false;
    }
    lastPointerType = event.pointerType;
    if (event.pointerType === 'touch') {
      pendingTouchTap = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, target };
      return false;
    }
    args.gridRootRef.current?.focus({ preventScroll: true });
    args.pointerClientRef.current = { x: event.clientX, y: event.clientY };
    autoScrollOrigin = { x: event.clientX, y: event.clientY };
    autoScrollArmed = false;
    return true;
  };

  const handleCellPointerDown = (cell: CellCoord, event: GridPointerEventLike) => {
    if (!beginPointerDown(event, { kind: 'cell', cell }) || args === null) {
      return;
    }
    args.dispatch(gridActions.activateCell(cell));
    if (args.enableRangeSelection) {
      args.dispatch(gridActions.startSelection(cell));
    }
  };

  const handleCellPointerEnter = (cell: CellCoord, event: GridPointerEventLike) => {
    if (args === null) {
      return;
    }
    if (args.enableRowHover) {
      args.setHoveredRowIndex(cell.row);
    }
    if (!args.enableRangeSelection) {
      return;
    }
    const current = dragState();
    if (current?.type !== 'selection' || current.selectionKind !== 'cell') {
      return;
    }
    args.pointerClientRef.current = { x: event.clientX, y: event.clientY };
    args.dispatch(gridActions.updateSelection(cell));
  };

  const handleRowHeaderPointerDown = (rowIndex: number, event: GridPointerEventLike) => {
    if (!beginPointerDown(event, { kind: 'row', rowIndex }) || args === null) {
      return;
    }
    if (args.enableRowSelection) {
      rowSelectionDragging = true;
      args.onGutterRowSelect(rowIndex, { shiftKey: event.shiftKey });
      startGutterRowSelectionAutoScroll();
      return;
    }
    args.dispatch(gridActions.startRowSelection(rowIndex));
  };

  const handleRowHeaderPointerEnter = (rowIndex: number, event: GridPointerEventLike) => {
    if (args === null) {
      return;
    }
    if (args.enableRowHover) {
      args.setHoveredRowIndex(rowIndex);
    }
    if (rowSelectionDragging) {
      args.pointerClientRef.current = { x: event.clientX, y: event.clientY };
      args.onGutterRowSelectDrag(rowIndex);
      return;
    }
    const current = dragState();
    if (current?.type !== 'selection' || current.selectionKind !== 'row') {
      return;
    }
    args.pointerClientRef.current = { x: event.clientX, y: event.clientY };
    args.dispatch(gridActions.updateRowSelection(rowIndex));
  };

  const handleColumnHeaderPointerDown = (colIndex: number, event: GridPointerEventLike) => {
    if (!beginPointerDown(event, { kind: 'col', colIndex }) || args === null) {
      return;
    }
    // Shift+クリックは複数ソートのトグル(合成列は対象外)。
    if (event.shiftKey && args.enableSorting) {
      const column = args.orderedColumns[colIndex];
      if (column && !isSyntheticColumnKey(column.key)) {
        const current = args.uiState.sort;
        const existingDir = current.find((entry) => entry.columnKey === column.key)?.direction;
        const direction: 'asc' | 'desc' = existingDir ? 'desc' : 'asc';
        const next = nextSortEntries(current, column.key, direction, true);
        args.dispatch(next.length === 0 ? gridActions.clearSort() : gridActions.setSort(next));
      }
      return;
    }
    args.dispatch(gridActions.startColumnSelection(colIndex));
  };

  const handleColumnHeaderPointerEnter = (colIndex: number, event: GridPointerEventLike) => {
    if (args === null) {
      return;
    }
    args.setHoveredRowIndex(null);
    if (args.enableColumnHeaderHover) {
      args.setHoveredColumnIndex(colIndex);
    }
    const current = dragState();
    if (current?.type !== 'selection' || current.selectionKind !== 'col') {
      return;
    }
    args.pointerClientRef.current = { x: event.clientX, y: event.clientY };
    args.dispatch(gridActions.updateColumnSelection(colIndex));
  };

  const handleCellDoubleClick = (cell: CellCoord) => {
    // タッチ由来の native dblclick は無視(タップ確定側でダブルタップを処理済み)。
    if (lastPointerType === 'touch' || args === null) {
      return;
    }
    args.onCellDoubleClickRef.current(cell);
  };

  return {
    update: (next) => {
      args = next;
      attachListeners();
      syncSelectionAutoScroll();
    },
    updateSelectionFromPointer,
    handleCellPointerDown,
    handleCellDoubleClick,
    handleCellPointerEnter,
    handleNativeDragStart: (event) => {
      event.preventDefault();
    },
    handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter,
    dispose: () => {
      detachListeners();
      stopSelectionAutoScroll();
      if (gutterAutoScrollFrame !== null) {
        cancelAnimationFrame(gutterAutoScrollFrame);
        gutterAutoScrollFrame = null;
      }
    },
  };
};