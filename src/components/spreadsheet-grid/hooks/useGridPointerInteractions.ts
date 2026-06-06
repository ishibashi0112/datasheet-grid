import {
  useCallback,
  useEffect,
  type Dispatch,
  type PointerEvent,
  type RefObject,
} from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { CellCoord, GridUiState } from '../model/gridTypes';
import {
  clamp,
  findColumnIndexFromOffset,
  type ColumnMeasurement,
} from '../logic/geometry';

type UseGridPointerInteractionsArgs<T> = {
  gridRootRef: RefObject<HTMLDivElement | null>;
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  pointerClientRef: RefObject<{ x: number; y: number } | null>;
  autoScrollFrameRef: RefObject<number | null>;
  uiState: GridUiState;
  dispatch: Dispatch<GridUiAction>;
  enableRangeSelection: boolean;
  filteredRowsLength: number;
  visibleColumnsLength: number;
  columnMeasurements: ColumnMeasurement<T>[];
  rowHeaderWidth: number;
  headerHeight: number;
  rowHeight: number;
};

// 追加: pointer 系 interaction（cell/row/col selection + drag auto-scroll + window pointer sync）をまとめます。
export const useGridPointerInteractions = <T,>({
  gridRootRef,
  bodyScrollRef,
  pointerClientRef,
  autoScrollFrameRef,
  uiState,
  dispatch,
  enableRangeSelection,
  filteredRowsLength,
  visibleColumnsLength,
  columnMeasurements,
  rowHeaderWidth,
  headerHeight,
  rowHeight,
}: UseGridPointerInteractionsArgs<T>) => {
  // 追加: client 座標から rowIndex / colIndex を推定します。
  const getCellCoordFromClientPoint = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      if (
        !bodyScrollRef.current ||
        filteredRowsLength === 0 ||
        visibleColumnsLength === 0
      ) {
        return null;
      }

      const scrollElement = bodyScrollRef.current;
      const rect = scrollElement.getBoundingClientRect();
      const x = scrollElement.scrollLeft + clientX - rect.left - rowHeaderWidth;
      const y = scrollElement.scrollTop + clientY - rect.top - headerHeight;
      const row = clamp(Math.floor(y / rowHeight), 0, filteredRowsLength - 1);
      const normalizedX = Math.max(x, 0);
      const col = findColumnIndexFromOffset(columnMeasurements, normalizedX);

      return {
        row,
        col: clamp(col, 0, visibleColumnsLength - 1),
      };
    },
    [
      bodyScrollRef,
      filteredRowsLength,
      visibleColumnsLength,
      columnMeasurements,
      rowHeaderWidth,
      headerHeight,
      rowHeight,
    ],
  );

  // 追加: 現在の dragState に応じて selection を更新します。
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
    [dispatch, getCellCoordFromClientPoint, uiState.dragState],
  );

  // 追加: selection drag / column resize drag 中の window pointer イベントを処理します。
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
  }, [dispatch, pointerClientRef, uiState.dragState]);

  // 追加: 範囲選択中、端に近づいたら自動スクロールします。
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
  }, [
    autoScrollFrameRef,
    bodyScrollRef,
    pointerClientRef,
    uiState.dragState,
    updateSelectionFromPointer,
  ]);

  // 追加: セルクリック/ドラッグ開始時の処理です。
  const handleCellPointerDown = useCallback(
    (cell: CellCoord, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      gridRootRef.current?.focus();
      dispatch(gridActions.activateCell(cell));
      if (enableRangeSelection) {
        dispatch(gridActions.startSelection(cell));
      }
    },
    [dispatch, enableRangeSelection, gridRootRef],
  );

  // 追加: selection drag 中にセルへ入ったら範囲更新します。
  const handleCellPointerEnter = useCallback(
    (cell: CellCoord, event: PointerEvent<HTMLDivElement>) => {
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
    },
    [dispatch, enableRangeSelection, pointerClientRef, uiState.dragState],
  );

  // 追加: ブラウザ標準の drag ghost を抑止します。
  const handleNativeDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  // 追加: 行ヘッダー選択開始です。
  const handleRowHeaderPointerDown = useCallback(
    (rowIndex: number, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      gridRootRef.current?.focus();
      dispatch(gridActions.startRowSelection(rowIndex));
    },
    [dispatch, gridRootRef],
  );

  // 追加: 行ヘッダードラッグ中の更新です。
  const handleRowHeaderPointerEnter = useCallback(
    (rowIndex: number, event: PointerEvent<HTMLDivElement>) => {
      if (
        uiState.dragState?.type !== 'selection' ||
        uiState.dragState.selectionKind !== 'row'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateRowSelection(rowIndex));
    },
    [dispatch, pointerClientRef, uiState.dragState],
  );

  // 追加: 列ヘッダー選択開始です。
  const handleColumnHeaderPointerDown = useCallback(
    (colIndex: number, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      gridRootRef.current?.focus();
      dispatch(gridActions.startColumnSelection(colIndex));
    },
    [dispatch, gridRootRef],
  );

  // 追加: 列ヘッダードラッグ中の更新です。
  const handleColumnHeaderPointerEnter = useCallback(
    (colIndex: number, event: PointerEvent<HTMLDivElement>) => {
      if (
        uiState.dragState?.type !== 'selection' ||
        uiState.dragState.selectionKind !== 'col'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateColumnSelection(colIndex));
    },
    [dispatch, pointerClientRef, uiState.dragState],
  );

  return {
    updateSelectionFromPointer,
    handleCellPointerDown,
    handleCellPointerEnter,
    handleNativeDragStart,
    handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter,
  };
};

export default useGridPointerInteractions;

