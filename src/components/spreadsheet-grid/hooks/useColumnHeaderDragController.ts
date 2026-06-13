import { useCallback, useRef, type PointerEvent, type RefObject } from 'react';
import type { GridColumn, GridColumnPinned } from '../model/gridTypes';
import {
  findPaneDropSlot,
  paneDropSlotBoundaryX,
  getColumnPane,
  type ColumnPane,
  type GridPaneLayout,
} from '../logic/geometry';

// 追加(13-B3-2): ヘッダーのバッジ(Excel 列名)を grip にした列の D&D 並べ替え controller です。
// 設計メモ:
//   - ドラッグ中は React state を更新しません。ドロップインジケータ(縦線)は各 pane に常設した
//     div を ref 経由で imperative に表示/移動します(SpreadsheetGrid は再レンダーせず、
//     GridHeaderRow の memo を完全維持。観点⑦)。
//   - pointerdown(バッジ) → setPointerCapture → captured 要素へ pointermove/up/cancel を直付け
//     (ephemeral listener。常駐 effect を増やしません)。
//   - ヒットテストは useGridPointerInteractions.getCellCoordFromClientPoint と同じ pane 判定式
//     (left.right より左=左 / right.left 以降=右 / それ以外=中央。中央は移動する rect.left で
//      横スクロール量を吸収。観点⑧)。slot は findPaneDropSlot(pane-local midpoint)で算出。
//   - up で computeHeaderReorderedKeys(全列の permutation を生成。非表示列も保全)→
//     applyColumnOrderAndPin(keys, pinOverride)。ドロップ先 pane → 'left'|undefined|'right'。
//   - 公開ハンドラは latest-ref で恒久安定化(GridHeaderRow memo 維持)。
//   - 範囲: center 内 / center↔left / center↔right が本命ですが、pane 判定が幾何的に一様な
//     ため left 内 / right 内 / left↔right も同一経路で成立します(13-B3-2b を実質吸収)。

type ApplyColumnOrderAndPin = (
  orderedKeys: string[],
  pinOverride?: Map<string, GridColumnPinned | undefined>,
) => void;

// 追加(13-B3-2): ドラッグ列を target pane の「表示列内 slot」へ移動した全列キー順を返します。
//   - 非表示列も含む columns 全体を pane ごとにキー配列へ分割 → ドラッグ列を source から除去 →
//     target pane の「表示列(visible)」基準の slot 位置へ挿入 → left+center+right を連結。
//   - same-pane では除去で後方が詰まるため slot を 1 補正し、同一 slot は no-op として null。
//   - slot は paneLayout.entries(表示列のみ)基準で来るため、ここでも visible 列でアンカーします。
//   - 返す配列は length === columns.length の permutation です(1 列のみ移動するため)。
//   ※ computeSectionReorderedKeys(ColumnChooserPanel)のクロスペイン版に相当します。
function computeHeaderReorderedKeys<T>(
  columns: GridColumn<T>[],
  draggedKey: string,
  targetPane: ColumnPane,
  slotInTargetVisible: number,
): string[] | null {
  const dragged = columns.find((column) => column.key === draggedKey);
  if (!dragged) return null;
  const sourcePane = getColumnPane(dragged);

  const groups: Record<ColumnPane, string[]> = { left: [], center: [], right: [] };
  const visibleByKey = new Map<string, boolean>();
  for (const column of columns) {
    groups[getColumnPane(column)].push(column.key);
    visibleByKey.set(column.key, column.visible !== false);
  }

  // ドラッグ前の「target pane 表示列内 index」(same-pane 補正 / no-op 判定用。cross-pane は -1)。
  const targetVisibleBefore = groups[targetPane].filter((key) =>
    visibleByKey.get(key),
  );
  const fromVisibleIndex = targetVisibleBefore.indexOf(draggedKey);

  // source から除去。
  const sourceIndex = groups[sourcePane].indexOf(draggedKey);
  if (sourceIndex < 0) return null;
  groups[sourcePane].splice(sourceIndex, 1);

  // slot 補正(same-pane で除去により後方が詰まる)。
  let slot = slotInTargetVisible;
  if (
    sourcePane === targetPane &&
    fromVisibleIndex >= 0 &&
    slot > fromVisibleIndex
  ) {
    slot -= 1;
  }

  // 除去後の target pane 表示列を基準に slot をクランプ。
  const targetVisibleAfter = groups[targetPane].filter((key) =>
    visibleByKey.get(key),
  );
  slot = Math.max(0, Math.min(slot, targetVisibleAfter.length));

  // same-pane・同一 slot は no-op(配列を動かさない)。
  if (
    sourcePane === targetPane &&
    fromVisibleIndex >= 0 &&
    slot === fromVisibleIndex
  ) {
    return null;
  }

  // 挿入位置(groups[targetPane] 実配列 index)を決定。
  let insertAt: number;
  if (slot >= targetVisibleAfter.length) {
    insertAt = groups[targetPane].length; // 末尾(後続の非表示列の後ろ)
  } else {
    insertAt = groups[targetPane].indexOf(targetVisibleAfter[slot]); // アンカー表示列の手前
  }
  groups[targetPane].splice(insertAt, 0, draggedKey);

  return [...groups.left, ...groups.center, ...groups.right];
}

type UseColumnHeaderDragControllerArgs<T> = {
  // controlled columns(onColumnsChange あり)のときだけ true。false ならドラッグ開始しません。
  enabled: boolean;
  // 全列(非表示含む)。permutation 生成と pane grouping に使います。
  columns: GridColumn<T>[];
  // 3 ペイン geometry。当たり判定 / slot / インジケータ位置の基準です。
  paneLayout: GridPaneLayout<T>;
  // 各ペイン要素 ref。clientX のペイン判定 + ローカル座標換算に使います。
  leftPaneScrollRef: RefObject<HTMLDivElement | null>;
  rightPaneScrollRef: RefObject<HTMLDivElement | null>;
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  // 端 autoscroll で動かす共有スクロールコンテナです。
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // 各ペインで列の前に確保する先頭幅(left=rowHeaderWidth / center=0 or rowHeaderWidth / right=0)。
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  // 並べ替え + 任意 pin 変更の共通 commit。
  applyColumnOrderAndPin: ApplyColumnOrderAndPin;
};

const EDGE_THRESHOLD = 24;
const SCROLL_STEP = 18;

export const useColumnHeaderDragController = <T,>(
  args: UseColumnHeaderDragControllerArgs<T>,
) => {
  // latest-ref: 公開ハンドラを恒久安定化するため、変化する引数はここから読みます。
  const latestRef = useRef(args);
  latestRef.current = args;

  const leftIndicatorRef = useRef<HTMLDivElement | null>(null);
  const centerIndicatorRef = useRef<HTMLDivElement | null>(null);
  const rightIndicatorRef = useRef<HTMLDivElement | null>(null);

  // ドラッグセッション state(すべて ref。ドラッグ中の再レンダーを発生させません)。
  const draggingKeyRef = useRef<string | null>(null);
  const dropTargetRef = useRef<{ pane: ColumnPane; slot: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const hideAllIndicators = useCallback(() => {
    for (const ref of [
      leftIndicatorRef,
      centerIndicatorRef,
      rightIndicatorRef,
    ]) {
      if (ref.current) ref.current.style.display = 'none';
    }
  }, []);

  // clientX → { pane, slot, leftPx(ペインローカル境界 x + leadingWidth) }。
  const computeHit = useCallback(
    (
      clientX: number,
    ): { pane: ColumnPane; slot: number; leftPx: number } | null => {
      const {
        paneLayout,
        leftPaneScrollRef,
        rightPaneScrollRef,
        bodyScrollRef,
        leftLeadingWidth,
        centerLeadingWidth,
        rightLeadingWidth,
      } = latestRef.current;

      // 左固定ペイン(右端より左)。
      const leftEl = leftPaneScrollRef.current;
      if (leftEl && paneLayout.left.entries.length > 0) {
        const rect = leftEl.getBoundingClientRect();
        if (clientX < rect.right) {
          const localX = clientX - rect.left - leftLeadingWidth;
          const slot = findPaneDropSlot(paneLayout.left, localX);
          return {
            pane: 'left',
            slot,
            leftPx: leftLeadingWidth + paneDropSlotBoundaryX(paneLayout.left, slot),
          };
        }
      }

      // 右固定ペイン(左端以降)。
      const rightEl = rightPaneScrollRef.current;
      if (rightEl && paneLayout.right.entries.length > 0) {
        const rect = rightEl.getBoundingClientRect();
        if (clientX >= rect.left) {
          const localX = clientX - rect.left - rightLeadingWidth;
          const slot = findPaneDropSlot(paneLayout.right, localX);
          return {
            pane: 'right',
            slot,
            leftPx:
              rightLeadingWidth + paneDropSlotBoundaryX(paneLayout.right, slot),
          };
        }
      }

      // それ以外は中央ペイン。中央は scrollLeft===0、移動する rect.left が横スクロールを吸収します。
      const centerEl = bodyScrollRef.current;
      if (centerEl && paneLayout.center.entries.length > 0) {
        const rect = centerEl.getBoundingClientRect();
        const localX =
          centerEl.scrollLeft + clientX - rect.left - centerLeadingWidth;
        const slot = findPaneDropSlot(paneLayout.center, Math.max(localX, 0));
        return {
          pane: 'center',
          slot,
          leftPx:
            centerLeadingWidth + paneDropSlotBoundaryX(paneLayout.center, slot),
        };
      }

      return null;
    },
    [],
  );

  const updateIndicator = useCallback(() => {
    const hit = computeHit(pointerRef.current.x);
    if (!hit) {
      dropTargetRef.current = null;
      hideAllIndicators();
      return;
    }
    dropTargetRef.current = { pane: hit.pane, slot: hit.slot };
    const indicatorByPane: Record<ColumnPane, HTMLDivElement | null> = {
      left: leftIndicatorRef.current,
      center: centerIndicatorRef.current,
      right: rightIndicatorRef.current,
    };
    for (const pane of ['left', 'center', 'right'] as ColumnPane[]) {
      const el = indicatorByPane[pane];
      if (!el) continue;
      if (pane === hit.pane) {
        el.style.left = `${hit.leftPx}px`;
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    }
  }, [computeHit, hideAllIndicators]);

  // rAF 端 autoscroll(共有スクロールコンテナ)。自己再帰のため ref 経由で参照します。
  const autoScrollTickRef = useRef<() => void>(() => {});
  const autoScrollTick = useCallback(() => {
    const el = latestRef.current.scrollContainerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const pointer = pointerRef.current;
      let nextLeft = el.scrollLeft;
      let nextTop = el.scrollTop;
      if (pointer.x < rect.left + EDGE_THRESHOLD) {
        nextLeft = Math.max(el.scrollLeft - SCROLL_STEP, 0);
      } else if (pointer.x > rect.right - EDGE_THRESHOLD) {
        nextLeft = el.scrollLeft + SCROLL_STEP;
      }
      if (pointer.y < rect.top + EDGE_THRESHOLD) {
        nextTop = Math.max(el.scrollTop - SCROLL_STEP, 0);
      } else if (pointer.y > rect.bottom - EDGE_THRESHOLD) {
        nextTop = el.scrollTop + SCROLL_STEP;
      }
      if (nextLeft !== el.scrollLeft || nextTop !== el.scrollTop) {
        el.scrollTo({ left: nextLeft, top: nextTop, behavior: 'auto' });
      }
    }
    // 端スクロールで rect が動くため、停止中の指でも毎フレーム slot を再計算します。
    updateIndicator();
    rafRef.current = requestAnimationFrame(autoScrollTickRef.current);
  }, [updateIndicator]);
  autoScrollTickRef.current = autoScrollTick;

  const endDrag = useCallback(
    (commit: boolean) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = '';
      hideAllIndicators();

      const draggedKey = draggingKeyRef.current;
      const target = dropTargetRef.current;
      draggingKeyRef.current = null;
      dropTargetRef.current = null;

      if (!commit || !draggedKey || !target) return;

      const { columns, applyColumnOrderAndPin } = latestRef.current;
      const keys = computeHeaderReorderedKeys(
        columns,
        draggedKey,
        target.pane,
        target.slot,
      );
      if (!keys) return; // no-op ドラッグ(同一 pane・同一 slot)
      const pinOverride = new Map<string, GridColumnPinned | undefined>([
        [draggedKey, target.pane === 'center' ? undefined : target.pane],
      ]);
      applyColumnOrderAndPin(keys, pinOverride);
    },
    [hideAllIndicators],
  );

  const onColumnDragHandlePointerDown = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLElement>) => {
      if (!latestRef.current.enabled) return;
      if (event.button !== 0) return;
      // 重要: ヘッダー本体の列範囲選択(onColumnHeaderPointerDown)へ伝播させない(掴み手方式)。
      event.stopPropagation();
      event.preventDefault();

      draggingKeyRef.current = column.key;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      document.body.style.cursor = 'grabbing';

      const target = event.currentTarget;
      const pointerId = event.pointerId;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* capture 不可環境は無視 */
      }

      const handleMove = (nativeEvent: globalThis.PointerEvent) => {
        pointerRef.current = { x: nativeEvent.clientX, y: nativeEvent.clientY };
        updateIndicator();
      };
      function handleUp() {
        cleanup();
        endDrag(true);
      }
      function handleCancel() {
        cleanup();
        endDrag(false);
      }
      const cleanup = () => {
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleCancel);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          /* noop */
        }
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleCancel);

      updateIndicator();
      rafRef.current = requestAnimationFrame(autoScrollTickRef.current);
    },
    [updateIndicator, endDrag],
  );

  return {
    onColumnDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
  };
};

export default useColumnHeaderDragController;
