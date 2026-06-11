import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent,
  type RefObject,
} from 'react';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { CellCoord, GridUiState } from '../model/gridTypes';
// 変更(10-E): グローバル座標(columnMeasurements)前提の当たり判定から、
//             ペイン別座標系の当たり判定へ切り替えます。
// 変更理由: 10-B〜10-D で DOM を 3 ペインに物理分離し、UI state の col は
//           「論理列 index（orderedColumns 空間＝左→中→右の視覚順）」になりました。
//           ところがドラッグ選択の実体は grid root の onPointerMoveCapture →
//           updateSelectionFromPointer であり、ここがグローバル座標 +
//           columnMeasurements(visibleColumns 順) のままだと、pinned 列を入れた
//           瞬間に「ドラッグ中の選択列がズレる」ため、ペイン別ヒットテストへ移行します。
import {
  clamp,
  findLogicalIndexFromPaneOffset,
  type GridPaneLayout,
} from '../logic/geometry';

type UseGridPointerInteractionsArgs<T> = {
  gridRootRef: RefObject<HTMLDivElement | null>;
  // 中央ペイン要素です。ヒットテストの基準矩形に使います。
  // 変更(10-G): 中央ペインはネイティブスクロールしなくなり（scrollTop/Left は常に 0）、
  //             その getBoundingClientRect() がスクロール量を反映して移動するため、
  //             当たり判定の式は従来のまま正しく機能します。
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  // 追加(10-G): 縦横ともにスクロールする「外側の共有スクロールコンテナ」です。
  //             ドラッグ選択中の自動スクロールはこの要素を動かします。
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // 追加(10-E): 左／右固定ペインのスクロール要素 ref です。clientX のペイン判定に使います。
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  pointerClientRef: RefObject<{ x: number; y: number } | null>;
  autoScrollFrameRef: RefObject<number | null>;
  uiState: GridUiState;
  dispatch: Dispatch<GridUiAction>;
  enableRangeSelection: boolean;
  filteredRowsLength: number;
  visibleColumnsLength: number;
  // 追加(10-E): 3 ペインの geometry です。当たり判定はこのペインローカル座標で行います。
  paneLayout: GridPaneLayout<T>;
  // 追加(10-E): 各ペインで列の前に確保する先頭幅です。
  //             左固定あり: left=rowHeaderWidth / center=0 / right=0
  //             左固定なし: center=rowHeaderWidth（従来と完全一致）
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  headerHeight: number;
  rowHeight: number;
};

// 追加: pointer 系 interaction（cell/row/col selection + drag auto-scroll + window pointer sync）をまとめます。
export const useGridPointerInteractions = <T,>({
  gridRootRef,
  bodyScrollRef,
  scrollContainerRef,
  leftPaneScrollRef,
  rightPaneScrollRef,
  pointerClientRef,
  autoScrollFrameRef,
  uiState,
  dispatch,
  enableRangeSelection,
  filteredRowsLength,
  visibleColumnsLength,
  paneLayout,
  leftLeadingWidth,
  centerLeadingWidth,
  rightLeadingWidth,
  headerHeight,
  rowHeight,
}: UseGridPointerInteractionsArgs<T>) => {
  // 追加(11-A2): dragState の最新値を ref で保持します(latest-ref パターン)。
  // 変更理由: enter 系ハンドラ(handleCellPointerEnter 等)が uiState.dragState を
  //           useCallback の依存に持つと、ドラッグ開始/終了のたびにハンドラの参照が
  //           変わり、props として受け取る GridBodyRow(memo) が全行で再レンダー
  //           されていました(クリック 1 回 = dragState が 2 回遷移 = 全行 ×2)。
  //           ハンドラは ref 経由で最新の dragState を読むことで、参照を恒久的に
  //           安定させます。render 中の代入は「最新値の読み出し専用 ref」という
  //           標準的な latest-ref 用法であり、レンダー結果には影響しません。
  const dragStateRef = useRef(uiState.dragState);
  dragStateRef.current = uiState.dragState;

  // 変更(10-E): client 座標から rowIndex / 論理 colIndex を推定します（ペイン別）。
  // 動作:
  //   - 縦(row)は中央ペイン基準。中央ペインの矩形はスクロール量ぶん移動し、scrollTop は 0 のため、
  //     scrollTop + clientY - rect.top - headerHeight がそのまま正しいコンテンツ内 y になります。
  //   - 横(col)は clientX がどのペイン領域に入るかで判定し、各ペインのローカル x から
  //     findLogicalIndexFromPaneOffset() で論理列 index を引きます。
  //   - 返す col は orderedColumns 空間の論理 index です（UI state と一致）。
  const getCellCoordFromClientPoint = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const centerEl = bodyScrollRef.current;
      if (
        !centerEl ||
        filteredRowsLength === 0 ||
        visibleColumnsLength === 0
      ) {
        return null;
      }

      // 縦方向（中央ペイン基準）。
      const centerRect = centerEl.getBoundingClientRect();
      const y = centerEl.scrollTop + clientY - centerRect.top - headerHeight;
      const row = clamp(Math.floor(y / rowHeight), 0, filteredRowsLength - 1);

      // 横方向（ペイン判定）。
      let col: number | null = null;

      // 左固定ペイン: 右端より左にあれば左ペイン扱い。
      //   行ヘッダー上（localX < 0）は findLogicalIndexFromPaneOffset が先頭列へクランプします。
      const leftEl = leftPaneScrollRef.current;
      if (col === null && leftEl && paneLayout.left.entries.length > 0) {
        const leftRect = leftEl.getBoundingClientRect();
        if (clientX < leftRect.right) {
          const localX = clientX - leftRect.left - leftLeadingWidth;
          col = findLogicalIndexFromPaneOffset(paneLayout.left, localX);
        }
      }

      // 右固定ペイン: 左端以降にあれば右ペイン扱い。
      const rightEl = rightPaneScrollRef.current;
      if (col === null && rightEl && paneLayout.right.entries.length > 0) {
        const rightRect = rightEl.getBoundingClientRect();
        if (clientX >= rightRect.left) {
          const localX = clientX - rightRect.left - rightLeadingWidth;
          col = findLogicalIndexFromPaneOffset(paneLayout.right, localX);
        }
      }

      // それ以外は中央ペイン。中央ペインは横スクロールしなくなった（scrollLeft===0）ため、
      // 移動する rect.left を使うことで水平スクロール量が自動的に反映されます。
      if (col === null && paneLayout.center.entries.length > 0) {
        const localX =
          centerEl.scrollLeft + clientX - centerRect.left - centerLeadingWidth;
        col = findLogicalIndexFromPaneOffset(
          paneLayout.center,
          Math.max(localX, 0),
        );
      }

      if (col === null) {
        return null;
      }

      return {
        row,
        col: clamp(col, 0, visibleColumnsLength - 1),
      };
    },
    [
      bodyScrollRef,
      leftPaneScrollRef,
      rightPaneScrollRef,
      filteredRowsLength,
      visibleColumnsLength,
      paneLayout,
      leftLeadingWidth,
      centerLeadingWidth,
      rightLeadingWidth,
      headerHeight,
      rowHeight,
    ],
  );

  // 追加: 現在の dragState に応じて selection を更新します。
  // 変更(11-A2): dragState は ref から読み、useCallback 依存から外します。
  //              これにより本関数の参照が安定し、これを依存に持つ自動スクロール
  //              effect の貼り直しも dragState 遷移時のみで済みます。
  const updateSelectionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.type !== 'selection') {
        return;
      }

      const cell = getCellCoordFromClientPoint(clientX, clientY);
      if (!cell) {
        return;
      }

      if (dragState.selectionKind === 'cell') {
        dispatch(gridActions.updateSelection(cell));
        return;
      }
      if (dragState.selectionKind === 'row') {
        dispatch(gridActions.updateRowSelection(cell.row));
        return;
      }
      if (dragState.selectionKind === 'col') {
        dispatch(gridActions.updateColumnSelection(cell.col));
      }
    },
    [dispatch, getCellCoordFromClientPoint],
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
  // 変更(10-G): スクロール対象を中央ペインから「共有スクロールコンテナ」へ。
  //             縦横ともにこのコンテナがネイティブスクロールするため、固定ペインも一緒に追従します。
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
      const scrollElement = scrollContainerRef.current;
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
    scrollContainerRef,
    pointerClientRef,
    uiState.dragState,
    updateSelectionFromPointer,
  ]);

  // 追加: セルクリック/ドラッグ開始時の処理です。
  // 注記(10-E): cell はペイン内の各セルから entry.logicalIndex がそのまま渡るため、
  //             ここはペイン非依存で正しく動作します（pinned 対応済み）。
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
  // 変更(11-A2): dragState を ref から読み、依存から外して参照を恒久安定化します。
  //              本ハンドラは GridBodyRow(memo) の props のため、参照の安定が
  //              そのまま「全行再レンダーの回避」に直結します。
  const handleCellPointerEnter = useCallback(
    (cell: CellCoord, event: PointerEvent<HTMLDivElement>) => {
      if (!enableRangeSelection) {
        return;
      }
      const dragState = dragStateRef.current;
      if (
        dragState?.type !== 'selection' ||
        dragState.selectionKind !== 'cell'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateSelection(cell));
    },
    [dispatch, enableRangeSelection, pointerClientRef],
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
  // 変更(11-A2): dragState を ref から読み、依存から外します(理由は上と同じ)。
  const handleRowHeaderPointerEnter = useCallback(
    (rowIndex: number, event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (
        dragState?.type !== 'selection' ||
        dragState.selectionKind !== 'row'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateRowSelection(rowIndex));
    },
    [dispatch, pointerClientRef],
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
  // 変更(11-A2): dragState を ref から読み、依存から外します(理由は上と同じ)。
  const handleColumnHeaderPointerEnter = useCallback(
    (colIndex: number, event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (
        dragState?.type !== 'selection' ||
        dragState.selectionKind !== 'col'
      ) {
        return;
      }
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      dispatch(gridActions.updateColumnSelection(colIndex));
    },
    [dispatch, pointerClientRef],
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