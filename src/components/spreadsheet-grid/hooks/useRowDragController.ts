import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { RowMetrics } from '../logic/verticalGeometry';
import {
  resolveMoveTargetIndex,
  resolveRowDropSlot,
  resolveRowDropSlotTop,
} from '../logic/rowReorder';
import {
  AUTO_SCROLL_ACTIVATION_DISTANCE,
  AUTO_SCROLL_EDGE_THRESHOLD,
  AUTO_SCROLL_STEP,
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from '../logic/autoScrollGeometry';
import { isInsideDetailCardOf } from '../logic/detailRow';

// 追加(row-drag ②): 行ドラッグ並び替えの controller です。列ヘッダー D&D
//   (useColumnHeaderDragController)と同じ設計方針を縦方向へ適用しています。
//   - ドラッグ中は React state を更新しません。ガイド線(各ペインに常設した水平線 div)と
//     ゴースト(body 直下の fixed ピル)は ref 経由で imperative に動かします(再レンダーゼロ)。
//   - pointerdown(ハンドル)→ window に pointermove / pointerup / pointercancel を登録
//     (このドラッグの pointerId のみ処理)。行は仮想化されており、autoscroll で掴んだ行が
//     窓外へ出るとハンドルごと unmount するため、要素直付けではなく window 登録が必須です
//     (CLAUDE.md「仮想化 DOM 上のドラッグ」)。
//   - ヒットテストは中央ペインの rect を基準に clientY → content-y(論理)へ換算し、
//     logic/rowReorder の resolveRowDropSlot(行メトリクス越し)でスロットを求めます。
//     uniform / auto-height / 展開行(detail 帯)のいずれでも同じ式です。
//   - 端の autoscroll は縦方向のみ(armed ガード付き)。
//   - up で resolveMoveTargetIndex → commitRowMove(from, to)(SpreadsheetGrid 側で
//     moveArrayItem + 履歴ラッパ経由の onRowsChange + onRowMove 通知)。
//   - 確定後の「新しい位置へスライド」は applyReorderSettle(FLIP)で、行要素の
//     translateY に差分を合成して 1 回だけ transition します(列側の settle と同じ考え方)。
//   - 将来 rowDragMotion: 'live'(ドラッグ中に周囲の行が退避)を足す場合も、スロット解決
//     (computeHit)はそのまま共有し、表示側(updateIndicator 相当)だけ差し替える想定です。

type UseRowDragControllerArgs = {
  // 操作可能(利用可能 かつ 表示順が恒等)のときだけ true。false ならドラッグ開始しません。
  enabled: boolean;
  // 行メトリクス(スロット解決 / ガイド線 y の基準)。
  rowMetrics: RowMetrics;
  headerHeight: number;
  // 物理 → 論理 scrollTop の倍率(scroll-space 仮想化)。通常 1。
  verticalScaleFactor: number;
  // 行 / overlay の transform 層内で差し引く基準オフセット(overlayBaseOffset)。通常 0。
  windowBaseOffsetPx: number;
  // 共有スクロールコンテナ(枠外判定 / 端 autoscroll)。
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  // 中央ペイン要素(縦ヒットテストの基準矩形)。
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  // ゴーストに出すラベル(view index → 文字列)。
  getRowDragLabel: (viewIndex: number) => string;
  // ドロップ確定(from / to は元配列 index。表示順が恒等のため view index と同値)。
  commitRowMove: (fromIndex: number, toIndex: number) => void;
};

const GHOST_OFFSET_X = 14;
const GHOST_OFFSET_Y = 12;
const GHOST_Z_INDEX = 9999;
const GHOST_ICON_SIZE = 14;
const GHOST_OUT_OPACITY = '0.5';

// 上下矢印(移動可)。
const GHOST_ICON_MOVE_VERTICAL =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="8 6 12 2 16 6"/><polyline points="16 18 12 22 8 18"/>' +
  '<line x1="12" y1="2" x2="12" y2="22"/></svg>';
// 禁止(枠外 = 離してもキャンセル)。
const GHOST_ICON_OUT =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>';

// 色はデザイントークン参照(styles.css の data-grid-drag-ghost セレクタでトークンが解決されます)。
const GHOST_INK_BACKGROUND = 'var(--ssg-ghost-bg)';
const GHOST_INK_COLOR = 'var(--ssg-ghost-text)';
const GHOST_INK_BORDER = 'var(--ssg-ghost-border)';
const GHOST_INK_SHADOW = 'var(--ssg-ghost-shadow)';

const SETTLE_MS = 200;
const SETTLE_EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

// ドラッグ中の行(3 ペイン分)へ付ける属性です。React が管理しない属性なので、hover 等の
//   再レンダーで className が上書きされても消えません(CSS 側で淡色表示)。
const DRAGGING_ROW_ATTRIBUTE = 'data-ssg-row-dragging';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TRANSLATE_Y_PATTERN = /translateY\((-?[\d.]+)px\)/;

// 行要素(3 ペイン分。展開行カード内のネストしたグリッドは除外)を列挙します。
const collectRowElements = (container: HTMLElement): HTMLElement[] => {
  const result: HTMLElement[] = [];
  container
    .querySelectorAll<HTMLElement>('.ssg-body-row[data-row-index]')
    .forEach((row) => {
      if (isInsideDetailCardOf(container, row)) return;
      result.push(row);
    });
  return result;
};

type RowDropHit = { slot: number; top: number };

export const useRowDragController = (args: UseRowDragControllerArgs) => {
  // latest-ref: 公開ハンドラを恒久安定化するため、変化する引数はここから読みます。
  const latestRef = useRef(args);
  // eslint-disable-next-line react-hooks/refs -- 意図的な latest-ref 同期です。読み手はイベントハンドラ / rAF / layout effect(applyReorderSettle)のみ。React Compiler 導入時に useLayoutEffect 同期へ書き換え予定。
  latestRef.current = args;

  const leftIndicatorRef = useRef<HTMLDivElement | null>(null);
  const centerIndicatorRef = useRef<HTMLDivElement | null>(null);
  const rightIndicatorRef = useRef<HTMLDivElement | null>(null);

  // ドラッグセッション state(すべて ref。ドラッグ中の再レンダーを発生させません)。
  const draggingIndexRef = useRef<number | null>(null);
  const dropSlotRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollArmedRef = useRef(false);
  const activeDragDisposeRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  // settle(FLIP)用: commit 直前の各行要素の screen-y。
  const settlePendingRef = useRef<Map<HTMLElement, number> | null>(null);

  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const ghostIconElRef = useRef<HTMLSpanElement | null>(null);
  const ghostStateRef = useRef<'move' | 'out' | null>(null);

  const hideAllIndicators = useCallback(() => {
    for (const ref of [leftIndicatorRef, centerIndicatorRef, rightIndicatorRef]) {
      if (ref.current) ref.current.style.display = 'none';
    }
  }, []);

  const createGhost = useCallback((label: string) => {
    if (ghostElRef.current) return;
    const el = document.createElement('div');
    el.setAttribute('data-grid-drag-ghost', '');
    if (
      latestRef.current.scrollContainerRef.current?.closest('.ssg-theme-dark') !=
      null
    ) {
      el.classList.add('ssg-theme-dark');
    }
    el.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'display:inline-flex',
      'align-items:center',
      'gap:7px',
      'padding:7px 12px 7px 10px',
      'border-radius:9px',
      'border:1px solid ' + GHOST_INK_BORDER,
      'background:' + GHOST_INK_BACKGROUND,
      'color:' + GHOST_INK_COLOR,
      'font-size:12px',
      'font-weight:600',
      'line-height:1',
      'white-space:nowrap',
      'max-width:280px',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'box-shadow:' + GHOST_INK_SHADOW,
      'pointer-events:none',
      'user-select:none',
      'z-index:' + GHOST_Z_INDEX,
      'will-change:transform',
      'transform:translate(-9999px,-9999px)',
    ].join(';');

    const icon = document.createElement('span');
    icon.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;width:' +
      GHOST_ICON_SIZE +
      'px;height:' +
      GHOST_ICON_SIZE +
      'px;flex:none';
    const text = document.createElement('span');
    text.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
    text.textContent = label;

    el.appendChild(icon);
    el.appendChild(text);
    document.body.appendChild(el);

    ghostElRef.current = el;
    ghostIconElRef.current = icon;
    ghostStateRef.current = null;
  }, []);

  const updateGhost = useCallback((hit: RowDropHit | null) => {
    const el = ghostElRef.current;
    if (!el) return;
    const { x, y } = pointerRef.current;
    el.style.transform =
      'translate(' + (x + GHOST_OFFSET_X) + 'px,' + (y + GHOST_OFFSET_Y) + 'px)';
    const state: 'move' | 'out' = hit ? 'move' : 'out';
    if (ghostStateRef.current === state) return;
    ghostStateRef.current = state;
    const icon = ghostIconElRef.current;
    if (state === 'out') {
      el.style.opacity = GHOST_OUT_OPACITY;
      if (icon) icon.innerHTML = GHOST_ICON_OUT;
    } else {
      el.style.opacity = '1';
      if (icon) icon.innerHTML = GHOST_ICON_MOVE_VERTICAL;
    }
  }, []);

  const destroyGhost = useCallback(() => {
    const el = ghostElRef.current;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    ghostElRef.current = null;
    ghostIconElRef.current = null;
    ghostStateRef.current = null;
  }, []);

  // ドラッグ中の行(3 ペイン分)の淡色表示属性を付け外しします。
  const setDraggingRowAttribute = useCallback(
    (viewIndex: number | null, on: boolean) => {
      const container = latestRef.current.scrollContainerRef.current;
      if (!container || viewIndex === null) return;
      container
        .querySelectorAll<HTMLElement>(
          `.ssg-body-row[data-row-index="${viewIndex}"]`,
        )
        .forEach((row) => {
          if (isInsideDetailCardOf(container, row)) return;
          if (on) {
            row.setAttribute(DRAGGING_ROW_ATTRIBUTE, '');
          } else {
            row.removeAttribute(DRAGGING_ROW_ATTRIBUTE);
          }
        });
    },
    [],
  );

  // clientX/clientY → { slot, top(ガイド線の transform 層内 y) } | null(枠外)。
  const computeHit = useCallback(
    (clientX: number, clientY: number): RowDropHit | null => {
      const {
        scrollContainerRef,
        bodyScrollRef,
        rowMetrics,
        headerHeight,
        verticalScaleFactor,
        windowBaseOffsetPx,
      } = latestRef.current;
      const containerEl = scrollContainerRef.current;
      const centerEl = bodyScrollRef.current;
      if (!containerEl || !centerEl) return null;

      // 枠外(共有スクロールコンテナの外)は hit なし(離すとキャンセル)。
      const r = containerEl.getBoundingClientRect();
      if (
        clientX < r.left ||
        clientX > r.right ||
        clientY < r.top ||
        clientY > r.bottom
      ) {
        return null;
      }

      // 縦: 中央ペイン基準の物理 y → 論理 content-y(useGridPointerInteractions と同じ換算)。
      const centerRect = centerEl.getBoundingClientRect();
      const physicalY =
        centerEl.scrollTop + clientY - centerRect.top - headerHeight;
      const d = containerEl.scrollTop * (1 - verticalScaleFactor);
      const logicalY = physicalY - d;
      const slot = resolveRowDropSlot(logicalY, rowMetrics);
      const slotTop = resolveRowDropSlotTop(slot, rowMetrics);
      return { slot, top: headerHeight + slotTop - windowBaseOffsetPx };
    },
    [],
  );

  const updateIndicator = useCallback(() => {
    const hit = computeHit(pointerRef.current.x, pointerRef.current.y);
    updateGhost(hit);
    const from = draggingIndexRef.current;
    // 掴んだ行の直上 / 直下(= 動かない)はガイド線を出さず、ドロップも no-op です。
    if (!hit || from === null || resolveMoveTargetIndex(from, hit.slot) === null) {
      dropSlotRef.current = null;
      hideAllIndicators();
      return;
    }
    dropSlotRef.current = hit.slot;
    for (const ref of [leftIndicatorRef, centerIndicatorRef, rightIndicatorRef]) {
      const el = ref.current;
      if (!el) continue;
      el.style.top = `${hit.top}px`;
      el.style.display = 'block';
    }
  }, [computeHit, hideAllIndicators, updateGhost]);

  // rAF 端 autoscroll(縦方向のみ)。自己再帰のため ref 経由で参照します。
  const autoScrollTickRef = useRef<() => void>(() => {});
  const autoScrollTick = useCallback(() => {
    if (draggingIndexRef.current === null) {
      rafRef.current = null;
      return;
    }
    const el = latestRef.current.scrollContainerRef.current;
    if (el) {
      const pointer = pointerRef.current;
      if (!autoScrollArmedRef.current) {
        const origin = dragOriginRef.current;
        if (
          !origin ||
          hasPointerLeftActivationRadius(
            origin,
            pointer,
            AUTO_SCROLL_ACTIVATION_DISTANCE,
          )
        ) {
          autoScrollArmedRef.current = true;
        }
      }
      if (autoScrollArmedRef.current) {
        const rect = el.getBoundingClientRect();
        const contentBox = resolveScrollContentBox({
          rectLeft: rect.left,
          rectTop: rect.top,
          clientLeft: el.clientLeft,
          clientTop: el.clientTop,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
        });
        const direction = resolveAutoScrollAxisDirection(
          pointer.y,
          contentBox.top,
          contentBox.bottom,
          AUTO_SCROLL_EDGE_THRESHOLD,
        );
        const nextTop = computeNextScrollPosition(
          el.scrollTop,
          direction,
          AUTO_SCROLL_STEP,
          el.scrollHeight - el.clientHeight,
        );
        if (nextTop !== el.scrollTop) {
          el.scrollTo({ top: nextTop, behavior: 'auto' });
        }
      }
    }
    // 端スクロールで rect が動くため、停止中の指でも毎フレーム slot を再計算します。
    updateIndicator();
    rafRef.current = requestAnimationFrame(autoScrollTickRef.current);
  }, [updateIndicator]);
  // eslint-disable-next-line react-hooks/refs -- 意図的な latest-callback 同期です(rAF ループが常に最新の tick を掴むため)。読み手は rAF / pointerdown ハンドラのみ。React Compiler 導入時に useLayoutEffect 同期へ書き換え予定。
  autoScrollTickRef.current = autoScrollTick;

  // commit 直前の各行要素の screen-y を記録します(FLIP の before)。
  const captureRowTops = useCallback((): Map<HTMLElement, number> | null => {
    const container = latestRef.current.scrollContainerRef.current;
    if (!container) return null;
    const map = new Map<HTMLElement, number>();
    for (const row of collectRowElements(container)) {
      map.set(row, row.getBoundingClientRect().top);
    }
    return map;
  }, []);

  const endDrag = useCallback(
    (commit: boolean) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = '';
      hideAllIndicators();
      destroyGhost();

      const from = draggingIndexRef.current;
      const slot = dropSlotRef.current;
      setDraggingRowAttribute(from, false);
      draggingIndexRef.current = null;
      dropSlotRef.current = null;
      dragOriginRef.current = null;

      if (!commit || from === null || slot === null) return;
      const to = resolveMoveTargetIndex(from, slot);
      if (to === null) return;

      settlePendingRef.current = prefersReducedMotion() ? null : captureRowTops();
      latestRef.current.commitRowMove(from, to);
    },
    [hideAllIndicators, destroyGhost, setDraggingRowAttribute, captureRowTops],
  );

  // 並べ替え確定後(commit 済みの DOM)に呼ばれ、行要素へ FLIP を 1 回当てて「新しい位置へ
  //   スライド」させます。settlePendingRef(commit 前の各行 y)が無ければ即 return。
  //   SpreadsheetGrid が rowModel 確定後の useLayoutEffect から呼びます(paint 前のため
  //   瞬間移動は不可視)。行の縦位置は translateY(inline)なので、差分を合成した値から
  //   React が設定した値へ transition します。
  const applyReorderSettle = useCallback(() => {
    const before = settlePendingRef.current;
    settlePendingRef.current = null;
    if (!before) return;
    const container = latestRef.current.scrollContainerRef.current;
    if (!container) return;

    const animated: HTMLElement[] = [];
    const targetYByRow = new Map<HTMLElement, number>();
    before.forEach((oldTop, row) => {
      if (!row.isConnected) return;
      const newTop = row.getBoundingClientRect().top;
      const delta = oldTop - newTop;
      if (Math.abs(delta) < 0.5) return;
      // React が設定した新しい translateY(= 最終位置)。差分を合成して一旦「元の位置」に見せます。
      const match = TRANSLATE_Y_PATTERN.exec(row.style.transform);
      if (!match) return;
      const targetY = parseFloat(match[1]);
      targetYByRow.set(row, targetY);
      row.style.transition = 'none';
      row.style.transform = `translateY(${targetY + delta}px)`;
      row.style.willChange = 'transform';
      animated.push(row);
    });
    if (animated.length === 0) return;

    // 初期(逆 transform)を確定させるため 1 回だけ強制リフロー。
    void container.getBoundingClientRect();

    // トランジションを付けて最終位置へ = 新しい位置へスライド。
    for (const row of animated) {
      row.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      row.style.transform = `translateY(${targetYByRow.get(row) ?? 0}px)`;
    }

    window.setTimeout(() => {
      for (const row of animated) {
        row.style.transition = '';
        row.style.willChange = '';
      }
    }, SETTLE_MS + 80);
  }, []);

  const onRowDragHandlePointerDown = useCallback(
    (viewIndex: number, event: PointerEvent<HTMLElement>) => {
      if (!latestRef.current.enabled) return;
      if (event.button !== 0) return;
      // セルの pointerdown(範囲選択 / アクティブ化)へ伝播させません(掴み手方式)。
      event.stopPropagation();
      event.preventDefault();

      draggingIndexRef.current = viewIndex;
      dropSlotRef.current = null;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      dragOriginRef.current = { x: event.clientX, y: event.clientY };
      autoScrollArmedRef.current = false;
      document.body.style.cursor = 'grabbing';
      createGhost(latestRef.current.getRowDragLabel(viewIndex));
      setDraggingRowAttribute(viewIndex, true);

      const target = event.currentTarget;
      const pointerId = event.pointerId;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* capture 不可環境は無視 */
      }

      const handleMove = (nativeEvent: globalThis.PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        pointerRef.current = { x: nativeEvent.clientX, y: nativeEvent.clientY };
        updateIndicator();
      };
      function handleUp(nativeEvent: globalThis.PointerEvent) {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
        endDrag(true);
      }
      function handleCancel(nativeEvent: globalThis.PointerEvent) {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
        endDrag(false);
      }
      // Escape でキャンセル(ガイド線 / ゴーストを消し、何も変更しません)。
      function handleKeyDown(nativeEvent: KeyboardEvent) {
        if (nativeEvent.key !== 'Escape') return;
        cleanup();
        endDrag(false);
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        window.removeEventListener('keydown', handleKeyDown);
        activeDragDisposeRef.current = null;
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          /* noop(ハンドルが unmount 済みでも無害) */
        }
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleCancel);
      window.addEventListener('keydown', handleKeyDown);
      activeDragDisposeRef.current = cleanup;

      updateIndicator();
      rafRef.current = requestAnimationFrame(autoScrollTickRef.current);
    },
    [updateIndicator, endDrag, createGhost, setDraggingRowAttribute],
  );

  // アンマウント時の最終後始末ネット(window リスナー / rAF / cursor / ゴースト)。
  useEffect(
    () => () => {
      activeDragDisposeRef.current?.();
      activeDragDisposeRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = '';
      const ghost = ghostElRef.current;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghostElRef.current = null;
      draggingIndexRef.current = null;
    },
    [],
  );

  return {
    onRowDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    applyReorderSettle,
  };
};

export default useRowDragController;