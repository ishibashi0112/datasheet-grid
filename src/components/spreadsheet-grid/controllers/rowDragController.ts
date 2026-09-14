// 追加(非依存化 ③-19): 行ドラッグ並び替えのコントローラです(React 非依存。旧 hooks/useRowDragController の本体を
//   移設)。列ヘッダー D&D(columnHeaderDragController)と同じ設計方針を縦方向へ適用しています。
//   - ドラッグ中はフレームワークの state を更新しません。ガイド線(各ペインに常設した水平線。args の indicator
//     ref 経由)とゴースト(body 直下の fixed ピル)を imperative に動かします(再レンダーゼロ)。
//   - pointerdown(ハンドル)→ window に pointermove / pointerup / pointercancel / keydown(Escape)を登録
//     (このドラッグの pointerId のみ処理)。行は仮想化されており、autoscroll で掴んだ行が窓外へ出るとハンドルごと
//     unmount するため、要素直付けではなく window 登録が必須です(CLAUDE.md「仮想化 DOM 上のドラッグ」)。
//   - ヒットテストは中央ペインの rect を基準に clientY → content-y(論理)へ換算し、logic/rowReorder の
//     resolveRowDropSlot(行メトリクス越し)でスロットを求めます。uniform / auto-height / 展開行でも同じ式。
//   - 端の autoscroll は縦方向のみ(armed ガード付き)。up で resolveMoveTargetIndex → commitRowMove(from, to)。
//   - 確定後の「新しい位置へスライド」は applyReorderSettle(FLIP)で、行要素の translateY に差分を合成して
//     1 回だけ transition します。
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
import { applySlotToElement } from '../logic/slotDom';
import type { GridResolvedSlot } from '../model/gridTypes.unbound';

type ReadonlyRef<V> = { readonly current: V };

export type RowDragArgs = {
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
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  // 中央ペイン要素(縦ヒットテストの基準矩形)。
  bodyScrollRef: ReadonlyRef<HTMLElement | null>;
  // 各ペインに常設するガイド線(水平線)要素です。
  leftIndicatorRef: ReadonlyRef<HTMLElement | null>;
  centerIndicatorRef: ReadonlyRef<HTMLElement | null>;
  rightIndicatorRef: ReadonlyRef<HTMLElement | null>;
  // ゴーストに出すラベル(view index → 文字列)。
  getRowDragLabel: (viewIndex: number) => string;
  // ドロップ確定(from / to は元配列 index。表示順が恒等のため view index と同値)。
  commitRowMove: (fromIndex: number, toIndex: number) => void;
  // classNames.dragGhost の解決済みスロット(ゴースト要素へ className / style)。
  ghostSlot?: GridResolvedSlot;
};

// ハンドルの pointerdown イベント(構造的型。React の合成 PointerEvent をそのまま渡せます)。
export type RowDragHandlePointerEvent = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: {
    setPointerCapture: (pointerId: number) => void;
    releasePointerCapture: (pointerId: number) => void;
  };
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type RowDragController = {
  update: (args: RowDragArgs) => void;
  onRowDragHandlePointerDown: (viewIndex: number, event: RowDragHandlePointerEvent) => void;
  // 並べ替え確定後(commit 済みの DOM、paint 前)に呼ぶ settle アニメ発火関数(armed 時のみ動作)。
  applyReorderSettle: () => void;
  dispose: () => void;
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

// ドラッグ中の行(3 ペイン分)へ付ける属性です。フレームワークが管理しない属性なので、hover 等の再レンダーで
//   className が上書きされても消えません(CSS 側で淡色表示)。
const DRAGGING_ROW_ATTRIBUTE = 'data-ssg-row-dragging';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TRANSLATE_Y_PATTERN = /translateY\((-?[\d.]+)px\)/;

// 行要素(3 ペイン分。展開行カード内のネストしたグリッドは除外)を列挙します。
const collectRowElements = (container: HTMLElement): HTMLElement[] => {
  const result: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>('.ssg-body-row[data-row-index]').forEach((row) => {
    if (isInsideDetailCardOf(container, row)) return;
    result.push(row);
  });
  return result;
};

type RowDropHit = { slot: number; top: number };

export const createRowDragController = (): RowDragController => {
  let args: RowDragArgs | null = null;

  // ドラッグセッション state。
  let draggingIndex: number | null = null;
  let dropSlot: number | null = null;
  let pointer = { x: 0, y: 0 };
  let dragOrigin: { x: number; y: number } | null = null;
  let autoScrollArmed = false;
  let activeDragDispose: (() => void) | null = null;
  let rafId: number | null = null;
  // settle(FLIP)用: commit 直前の各行要素の screen-y。
  let settlePending: Map<HTMLElement, number> | null = null;

  let ghostEl: HTMLDivElement | null = null;
  let ghostIconEl: HTMLSpanElement | null = null;
  let ghostState: 'move' | 'out' | null = null;

  const indicatorElements = (): (HTMLElement | null)[] => [
    args?.leftIndicatorRef.current ?? null,
    args?.centerIndicatorRef.current ?? null,
    args?.rightIndicatorRef.current ?? null,
  ];

  const hideAllIndicators = () => {
    for (const el of indicatorElements()) {
      if (el) el.style.display = 'none';
    }
  };

  const createGhost = (label: string) => {
    if (ghostEl) return;
    const el = document.createElement('div');
    el.setAttribute('data-grid-drag-ghost', '');
    if (args?.scrollContainerRef.current?.closest('.ssg-theme-dark') != null) {
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
    // classNames.dragGhost を反映します(style は上記の既定インラインより後勝ち。座標は transform で毎フレーム上書き)。
    applySlotToElement(el, args?.ghostSlot);

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

    ghostEl = el;
    ghostIconEl = icon;
    ghostState = null;
  };

  const updateGhost = (hit: RowDropHit | null) => {
    const el = ghostEl;
    if (!el) return;
    el.style.transform =
      'translate(' + (pointer.x + GHOST_OFFSET_X) + 'px,' + (pointer.y + GHOST_OFFSET_Y) + 'px)';
    const state: 'move' | 'out' = hit ? 'move' : 'out';
    if (ghostState === state) return;
    ghostState = state;
    const icon = ghostIconEl;
    if (state === 'out') {
      el.style.opacity = GHOST_OUT_OPACITY;
      if (icon) icon.innerHTML = GHOST_ICON_OUT;
    } else {
      el.style.opacity = '1';
      if (icon) icon.innerHTML = GHOST_ICON_MOVE_VERTICAL;
    }
  };

  const destroyGhost = () => {
    if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
    ghostEl = null;
    ghostIconEl = null;
    ghostState = null;
  };

  // ドラッグ中の行(3 ペイン分)の淡色表示属性を付け外しします。
  const setDraggingRowAttribute = (viewIndex: number | null, on: boolean) => {
    const container = args?.scrollContainerRef.current ?? null;
    if (!container || viewIndex === null) return;
    container
      .querySelectorAll<HTMLElement>(`.ssg-body-row[data-row-index="${viewIndex}"]`)
      .forEach((row) => {
        if (isInsideDetailCardOf(container, row)) return;
        if (on) {
          row.setAttribute(DRAGGING_ROW_ATTRIBUTE, '');
        } else {
          row.removeAttribute(DRAGGING_ROW_ATTRIBUTE);
        }
      });
  };

  // clientX/clientY → { slot, top(ガイド線の transform 層内 y) } | null(枠外)。
  const computeHit = (clientX: number, clientY: number): RowDropHit | null => {
    if (args === null) return null;
    const { scrollContainerRef, bodyScrollRef, rowMetrics, headerHeight, verticalScaleFactor, windowBaseOffsetPx } =
      args;
    const containerEl = scrollContainerRef.current;
    const centerEl = bodyScrollRef.current;
    if (!containerEl || !centerEl) return null;

    // 枠外(共有スクロールコンテナの外)は hit なし(離すとキャンセル)。
    const r = containerEl.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
      return null;
    }

    // 縦: 中央ペイン基準の物理 y → 論理 content-y(pointerInteractionsController と同じ換算)。
    const centerRect = centerEl.getBoundingClientRect();
    const physicalY = centerEl.scrollTop + clientY - centerRect.top - headerHeight;
    const d = containerEl.scrollTop * (1 - verticalScaleFactor);
    const logicalY = physicalY - d;
    const slot = resolveRowDropSlot(logicalY, rowMetrics);
    const slotTop = resolveRowDropSlotTop(slot, rowMetrics);
    return { slot, top: headerHeight + slotTop - windowBaseOffsetPx };
  };

  const updateIndicator = () => {
    const hit = computeHit(pointer.x, pointer.y);
    updateGhost(hit);
    const from = draggingIndex;
    // 掴んだ行の直上 / 直下(= 動かない)はガイド線を出さず、ドロップも no-op です。
    if (!hit || from === null || resolveMoveTargetIndex(from, hit.slot) === null) {
      dropSlot = null;
      hideAllIndicators();
      return;
    }
    dropSlot = hit.slot;
    for (const el of indicatorElements()) {
      if (!el) continue;
      el.style.top = `${hit.top}px`;
      el.style.display = 'block';
    }
  };

  // rAF 端 autoscroll(縦方向のみ)。
  const autoScrollTick = () => {
    if (draggingIndex === null) {
      rafId = null;
      return;
    }
    const el = args?.scrollContainerRef.current ?? null;
    if (el) {
      if (!autoScrollArmed) {
        if (!dragOrigin || hasPointerLeftActivationRadius(dragOrigin, pointer, AUTO_SCROLL_ACTIVATION_DISTANCE)) {
          autoScrollArmed = true;
        }
      }
      if (autoScrollArmed) {
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
    rafId = requestAnimationFrame(autoScrollTick);
  };

  // commit 直前の各行要素の screen-y を記録します(FLIP の before)。
  const captureRowTops = (): Map<HTMLElement, number> | null => {
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return null;
    const map = new Map<HTMLElement, number>();
    for (const row of collectRowElements(container)) {
      map.set(row, row.getBoundingClientRect().top);
    }
    return map;
  };

  const endDrag = (commit: boolean) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    document.body.style.cursor = '';
    hideAllIndicators();
    destroyGhost();

    const from = draggingIndex;
    const slot = dropSlot;
    setDraggingRowAttribute(from, false);
    draggingIndex = null;
    dropSlot = null;
    dragOrigin = null;

    if (!commit || from === null || slot === null || args === null) return;
    const to = resolveMoveTargetIndex(from, slot);
    if (to === null) return;

    settlePending = prefersReducedMotion() ? null : captureRowTops();
    args.commitRowMove(from, to);
  };

  // 並べ替え確定後(commit 済みの DOM)に呼ばれ、行要素へ FLIP を 1 回当てて「新しい位置へスライド」させます。
  //   行の縦位置は translateY(inline)なので、差分を合成した値から本体が設定した値へ transition します。
  const applyReorderSettle = () => {
    const before = settlePending;
    settlePending = null;
    if (!before) return;
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return;

    const animated: HTMLElement[] = [];
    const targetYByRow = new Map<HTMLElement, number>();
    before.forEach((oldTop, row) => {
      if (!row.isConnected) return;
      const newTop = row.getBoundingClientRect().top;
      const delta = oldTop - newTop;
      if (Math.abs(delta) < 0.5) return;
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
  };

  const onRowDragHandlePointerDown = (viewIndex: number, event: RowDragHandlePointerEvent) => {
    if (args === null || !args.enabled) return;
    if (event.button !== 0) return;
    // セルの pointerdown(範囲選択 / アクティブ化)へ伝播させません(掴み手方式)。
    event.stopPropagation();
    event.preventDefault();

    draggingIndex = viewIndex;
    dropSlot = null;
    pointer = { x: event.clientX, y: event.clientY };
    dragOrigin = { x: event.clientX, y: event.clientY };
    autoScrollArmed = false;
    document.body.style.cursor = 'grabbing';
    createGhost(args.getRowDragLabel(viewIndex));
    setDraggingRowAttribute(viewIndex, true);

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* capture 不可環境は無視 */
    }

    const handleMove = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pointerId) return;
      pointer = { x: nativeEvent.clientX, y: nativeEvent.clientY };
      updateIndicator();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('keydown', handleKeyDown);
      activeDragDispose = null;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* noop(ハンドルが unmount 済みでも無害) */
      }
    };
    function handleUp(nativeEvent: PointerEvent) {
      if (nativeEvent.pointerId !== pointerId) return;
      cleanup();
      endDrag(true);
    }
    function handleCancel(nativeEvent: PointerEvent) {
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

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKeyDown);
    activeDragDispose = cleanup;

    updateIndicator();
    rafId = requestAnimationFrame(autoScrollTick);
  };

  return {
    update: (next) => {
      args = next;
    },
    onRowDragHandlePointerDown,
    applyReorderSettle,
    // 最終後始末ネット(window リスナー / rAF / cursor / ゴースト / ドラッグ中属性)。
    dispose: () => {
      activeDragDispose?.();
      activeDragDispose = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = '';
      destroyGhost();
      setDraggingRowAttribute(draggingIndex, false);
      draggingIndex = null;
      dropSlot = null;
    },
  };
};