// 追加(非依存化 ③-18): ヘッダーのバッジを grip にした列の D&D 並べ替えコントローラです
//   (React 非依存。旧 hooks/useColumnHeaderDragController の本体を移設。設計メモは以下)。
//   - ドラッグ中はフレームワークの state を更新しません。ドロップインジケータ(縦線)は各 pane に常設した
//     要素(args の indicator ref 経由)を imperative に表示 / 移動します(ヘッダー行の memo を完全維持)。
//   - pointerdown(バッジ) → setPointerCapture → window へ pointermove / up / cancel を登録(このドラッグの
//     pointerId のみ処理)。仮想化で grip が unmount しても window 登録ならイベントを受けられます(13-B3-7)。
//   - ヒットテストは pointerInteractionsController.getCellCoordFromClientPoint と同じ pane 判定式
//     (left.right より左=左 / right.left 以降=右 / それ以外=中央。中央は移動する rect.left で横スクロール量を
//      吸収)。slot は findPaneDropSlot(pane-local midpoint)で算出。
//   - up で computeHeaderReorderedKeys(全列の permutation。非表示列も保全)→ applyColumnOrderAndPin(keys, pinOverride)。
//   - dispose はドラッグ中でも window リスナー / rAF / body cursor / ゴーストを確実に後始末します。
import type { GridColumn, GridColumnPinned, GridResolvedSlot } from '../model/gridTypes';
import {
  findPaneDropSlot,
  paneDropSlotBoundaryX,
  getColumnPane,
  type ColumnPane,
  type GridPaneLayout,
} from '../logic/geometry';
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

type ApplyColumnOrderAndPin = (
  orderedKeys: string[],
  pinOverride?: Map<string, GridColumnPinned | undefined>,
) => void;

// 全列 permutation を返します(非表示列も保全)。並び替え不要(同 pane・同 slot)なら null。
//   - dragged を source pane から除去 → target pane の「表示列(visible)」基準の slot 位置へ挿入 →
//     left+center+right を連結。
//   - same-pane では除去で後方が詰まるため slot を 1 補正し、同一 slot は no-op として null。
//   - slot は paneLayout.entries(表示列のみ)基準で来るため、ここでも visible 列でアンカーします。
//   ※ computeSectionReorderedKeys(ColumnChooserPanel)のクロスペイン版に相当します。
export function computeHeaderReorderedKeys<T>(
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
  const targetVisibleBefore = groups[targetPane].filter((key) => visibleByKey.get(key));
  const fromVisibleIndex = targetVisibleBefore.indexOf(draggedKey);

  const sourceIndex = groups[sourcePane].indexOf(draggedKey);
  if (sourceIndex < 0) return null;
  groups[sourcePane].splice(sourceIndex, 1);

  let slot = slotInTargetVisible;
  if (sourcePane === targetPane && fromVisibleIndex >= 0 && slot > fromVisibleIndex) {
    slot -= 1;
  }

  const targetVisibleAfter = groups[targetPane].filter((key) => visibleByKey.get(key));
  slot = Math.max(0, Math.min(slot, targetVisibleAfter.length));

  if (sourcePane === targetPane && fromVisibleIndex >= 0 && slot === fromVisibleIndex) {
    return null;
  }

  let insertAt: number;
  if (slot >= targetVisibleAfter.length) {
    insertAt = groups[targetPane].length; // 末尾(後続の非表示列の後ろ)
  } else {
    insertAt = groups[targetPane].indexOf(targetVisibleAfter[slot]); // アンカー表示列の手前
  }
  groups[targetPane].splice(insertAt, 0, draggedKey);

  return [...groups.left, ...groups.center, ...groups.right];
}

type ReadonlyRef<V> = { readonly current: V };

export type ColumnHeaderDragArgs<T> = {
  // controlled columns(onColumnsChange あり)のときだけ true。false ならドラッグ開始しません。
  enabled: boolean;
  // 全列(非表示含む)。permutation 生成と pane grouping に使います。
  columns: GridColumn<T>[];
  // 3 ペイン geometry。当たり判定 / slot / インジケータ位置の基準です。
  paneLayout: GridPaneLayout<T>;
  // 各ペイン要素 ref。clientX のペイン判定 + ローカル座標換算に使います。
  leftPaneScrollRef: ReadonlyRef<HTMLElement | null>;
  rightPaneScrollRef: ReadonlyRef<HTMLElement | null>;
  bodyScrollRef: ReadonlyRef<HTMLElement | null>;
  // 端 autoscroll で動かす共有スクロールコンテナです。
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  // 各ペインに常設するドロップインジケータ(縦線)要素です。
  leftIndicatorRef: ReadonlyRef<HTMLElement | null>;
  centerIndicatorRef: ReadonlyRef<HTMLElement | null>;
  rightIndicatorRef: ReadonlyRef<HTMLElement | null>;
  // 各ペインで列の前に確保する先頭幅(left=rowHeaderWidth / center=0 or rowHeaderWidth / right=0)。
  leftLeadingWidth: number;
  centerLeadingWidth: number;
  rightLeadingWidth: number;
  // 並べ替え + 任意 pin 変更の共通 commit。
  applyColumnOrderAndPin: ApplyColumnOrderAndPin;
  // classNames.dragGhost の解決済みスロット(ゴースト要素へ className / style)。
  ghostSlot?: GridResolvedSlot;
};

// grip の pointerdown イベント(構造的型。React の合成 PointerEvent をそのまま渡せます)。
export type ColumnDragHandlePointerEvent = {
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

export type ColumnHeaderDragController<T> = {
  update: (args: ColumnHeaderDragArgs<T>) => void;
  onColumnDragHandlePointerDown: (column: GridColumn<T>, event: ColumnDragHandlePointerEvent) => void;
  // 並べ替え確定後(commit 済みの DOM、paint 前)に呼ぶ settle アニメ発火関数(armed 時のみ動作)。
  applyReorderSettle: () => void;
  dispose: () => void;
};

// 空の固定ペイン(pinned 列 0 本)への「最初の 1 列」を作るためのドロップ帯(13-B3-3)。空ペインは幅 0・非レンダーで
//   物理的に狙える場所が無いため、ドラッグ中だけビューポート端の EMPTY_PANE_DROP_BAND px を pin 用ホット帯にします。
//   autoscroll 帯(AUTO_SCROLL_EDGE_THRESHOLD=24)⊂ ドロップ帯(32)。端でスクロールしつつ、離した瞬間の判定で pin 確定。
const EMPTY_PANE_DROP_BAND = 32;
// 空ペインのインジケータをビューポート端の数 px 内側へ寄せる量(端ぴったりだと 2px 線が overflow:auto でクリップ
//   される)。左は +inset、右は -inset(右 wrapper は width:0・sticky で原点がビューポート右端のため符号が反転)。
const EMPTY_PANE_INDICATOR_INSET = 2;

// ドラッグゴースト(ポインタ追従のピル。13-B3-5)。body 直下に imperative 生成する fixed 要素で、pointermove /
//   autoscroll の毎フレームに transform: translate で追従します。ポインタからわずかに右下へオフセット。
const GHOST_OFFSET_X = 14;
const GHOST_OFFSET_Y = 12;
// popover(createPortal の fixed 要素)より前面に出します。ドラッグ中だけ DOM に存在します。
const GHOST_Z_INDEX = 9999;
const GHOST_ICON_SIZE = 14;

// ゴーストのアイコン(軽量 inline SVG)。computeHit の pane で出し分けます。
//   move(四方向矢印)= center へ移動 / pin = left・right へ固定(空ペイン帯を含む)/ out(スラッシュ円)= 枠外(無効)。
//   いずれも stroke="currentColor" のため、ピル側の color を継承して着色されます。
const GHOST_ICON_MOVE =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>' +
  '<polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>' +
  '<line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
const GHOST_ICON_PIN =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<line x1="12" y1="17" x2="12" y2="22"/>' +
  '<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';
const GHOST_ICON_OUT =
  '<svg viewBox="0 0 24 24" width="' +
  GHOST_ICON_SIZE +
  '" height="' +
  GHOST_ICON_SIZE +
  '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>';

// ゴーストは「チャコール無地の角丸チップ」。状態は色ではなく「アイコン + 濃度」で出し分けます。色はデザイントークン
//   参照(ゴースト root(data-grid-drag-ghost)は styles.css のトークン定義セレクタリストに含まれる)。
const GHOST_INK_BACKGROUND = 'var(--ssg-ghost-bg)';
const GHOST_INK_COLOR = 'var(--ssg-ghost-text)';
const GHOST_INK_BORDER = 'var(--ssg-ghost-border)';
const GHOST_INK_SHADOW = 'var(--ssg-ghost-shadow)';
// 枠外(無効)時の濃度。色は変えず opacity だけ落として「ここで離しても無効」を示します。
const GHOST_OUT_OPACITY = '0.5';

// 列の並べ替え確定時に「新しい位置へスライド」させる settle アニメ(案A)。ドロップ commit 後、各列セルへ FLIP
//   (transform)を 1 回だけ当てます。対象は「画面に見えているセル」だけ(行・列とも仮想化)。
const SETTLE_MS = 200;
const SETTLE_EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

// prefers-reduced-motion ではアニメせずスナップします(アクセシビリティ)。
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 現在の各列の screen-x(getBoundingClientRect().left)を列キーで記録します(FLIP の before)。
//   同じ列のヘッダー / 本体セルは同じ x のため、列キーごとに最初の 1 セルだけ測れば十分です。
const captureColumnLefts = (container: HTMLElement | null): Map<string, number> | null => {
  if (!container) return null;
  const map = new Map<string, number>();
  container.querySelectorAll<HTMLElement>('[data-ssg-col-key]').forEach((cell) => {
    // 展開行カード内にネストしたグリッドのセルは測りません(detail ④)。
    if (isInsideDetailCardOf(container, cell)) return;
    const key = cell.dataset.ssgColKey;
    if (key && !map.has(key)) {
      map.set(key, cell.getBoundingClientRect().left);
    }
  });
  return map;
};

type DropHit = { pane: ColumnPane; slot: number; leftPx: number };

export const createColumnHeaderDragController = <T,>(): ColumnHeaderDragController<T> => {
  let args: ColumnHeaderDragArgs<T> | null = null;

  // ドラッグセッション state。
  let draggingKey: string | null = null;
  let dropTarget: { pane: ColumnPane; slot: number } | null = null;
  // 並べ替え確定時の FLIP 用に、commit 直前の各列 screen-x を保持します(same-pane のときだけセット、
  //   applyReorderSettle で消費。cross-pane / reduced-motion は null = スナップ)。
  let settlePending: Map<string, number> | null = null;
  let pointer = { x: 0, y: 0 };
  // 端 autoscroll の armed 管理。掴んだ座標を起点に AUTO_SCROLL_ACTIVATION_DISTANCE 以上動くまで発動しません。
  let dragOrigin: { x: number; y: number } | null = null;
  let autoScrollArmed = false;
  // 進行中ドラッグの window リスナー解除関数(pointerdown 内で登録。dispose の最終後始末ネットからも呼ぶ)。
  let activeDragDispose: (() => void) | null = null;
  let rafId: number | null = null;

  // ゴースト(ピル本体 / アイコンスロット / 直近の状態。同状態のフレームは DOM 差替をスキップ)。
  let ghostEl: HTMLDivElement | null = null;
  let ghostIconEl: HTMLSpanElement | null = null;
  let ghostState: ColumnPane | 'out' | null = null;

  const indicatorElements = (): Record<ColumnPane, HTMLElement | null> => ({
    left: args?.leftIndicatorRef.current ?? null,
    center: args?.centerIndicatorRef.current ?? null,
    right: args?.rightIndicatorRef.current ?? null,
  });

  const hideAllIndicators = () => {
    for (const el of Object.values(indicatorElements())) {
      if (el) el.style.display = 'none';
    }
  };

  // ドラッグ開始時にゴースト(ピル)を body 直下へ生成します(冪等)。ラベルは列名(title || key)。
  const createGhost = (label: string) => {
    if (ghostEl) return;
    const el = document.createElement('div');
    el.setAttribute('data-grid-drag-ghost', '');
    // グリッド root のダークテーマ修飾子をゴーストへ引き継ぎます(ドラッグ開始時点のテーマで固定)。
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
      'box-shadow:' + GHOST_INK_SHADOW,
      'pointer-events:none',
      'user-select:none',
      'z-index:' + GHOST_Z_INDEX,
      'will-change:transform',
      // 初期は画面外へ逃がし、最初の updateGhost でポインタ位置へ正規化します。
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
    text.textContent = label;
    el.appendChild(icon);
    el.appendChild(text);
    document.body.appendChild(el);

    ghostEl = el;
    ghostIconEl = icon;
    ghostState = null;
  };

  // ゴーストの位置(常にポインタ基準)とアイコン / 濃度(pane で出し分け)を更新します。
  const updateGhost = (pane: ColumnPane | null) => {
    const el = ghostEl;
    if (!el) return;
    el.style.transform =
      'translate(' + (pointer.x + GHOST_OFFSET_X) + 'px,' + (pointer.y + GHOST_OFFSET_Y) + 'px)';
    const state: ColumnPane | 'out' = pane ?? 'out';
    if (ghostState === state) return;
    ghostState = state;
    const icon = ghostIconEl;
    if (state === 'out') {
      el.style.opacity = GHOST_OUT_OPACITY;
      if (icon) icon.innerHTML = GHOST_ICON_OUT;
    } else {
      el.style.opacity = '1';
      if (icon) {
        icon.innerHTML = state === 'center' ? GHOST_ICON_MOVE : GHOST_ICON_PIN;
      }
    }
  };

  const destroyGhost = () => {
    if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
    ghostEl = null;
    ghostIconEl = null;
    ghostState = null;
  };

  // clientX/clientY → { pane, slot, leftPx(ペインローカル境界 x + leadingWidth) }。枠外は null。
  const computeHit = (clientX: number, clientY: number): DropHit | null => {
    if (args === null) return null;
    const {
      paneLayout,
      leftPaneScrollRef,
      rightPaneScrollRef,
      bodyScrollRef,
      scrollContainerRef,
      leftLeadingWidth,
      centerLeadingWidth,
      rightLeadingWidth,
    } = args;

    // 表の枠(共有スクロールコンテナ)の外へポインタが出たら hit なし(= 枠外ドロップはキャンセル / no-op)。
    //   この判定は空ペイン帯より「前」に置きます(右空ペイン帯は clientX に上限が無く枠の右外でもマッチするため)。
    const containerEl = scrollContainerRef.current;
    if (containerEl) {
      const r = containerEl.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
        return null;
      }
    }

    const leftEl = leftPaneScrollRef.current;
    const rightEl = rightPaneScrollRef.current;

    // 空の左固定ペインへのドロップ帯(left wrapper は sticky;left:0 なので rect.left === ビューポート左端)。
    if (leftEl && paneLayout.left.entries.length === 0) {
      const rect = leftEl.getBoundingClientRect();
      if (clientX <= rect.left + EMPTY_PANE_DROP_BAND) {
        return { pane: 'left', slot: 0, leftPx: EMPTY_PANE_INDICATOR_INSET };
      }
    }
    // 左固定ペイン(非空)。右端より左。
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
    // 空の右固定ペインへのドロップ帯(right wrapper は sticky;right:0・width:0 なので rect.left === ビューポート右端)。
    if (rightEl && paneLayout.right.entries.length === 0) {
      const rect = rightEl.getBoundingClientRect();
      if (clientX >= rect.left - EMPTY_PANE_DROP_BAND) {
        return { pane: 'right', slot: 0, leftPx: -EMPTY_PANE_INDICATOR_INSET };
      }
    }
    // 右固定ペイン(非空)。左端以降。
    if (rightEl && paneLayout.right.entries.length > 0) {
      const rect = rightEl.getBoundingClientRect();
      if (clientX >= rect.left) {
        const localX = clientX - rect.left - rightLeadingWidth;
        const slot = findPaneDropSlot(paneLayout.right, localX);
        return {
          pane: 'right',
          slot,
          leftPx: rightLeadingWidth + paneDropSlotBoundaryX(paneLayout.right, slot),
        };
      }
    }
    // それ以外は中央ペイン。中央は scrollLeft===0、移動する rect.left が横スクロールを吸収します。
    const centerEl = bodyScrollRef.current;
    if (centerEl && paneLayout.center.entries.length > 0) {
      const rect = centerEl.getBoundingClientRect();
      const localX = centerEl.scrollLeft + clientX - rect.left - centerLeadingWidth;
      const slot = findPaneDropSlot(paneLayout.center, Math.max(localX, 0));
      return {
        pane: 'center',
        slot,
        leftPx: centerLeadingWidth + paneDropSlotBoundaryX(paneLayout.center, slot),
      };
    }
    return null;
  };

  const updateIndicator = () => {
    const hit = computeHit(pointer.x, pointer.y);
    // ゴーストは hit の有無に関わらずポインタへ追従(枠外=null は 'out' 表現)。縦線の表示判定は hit 基準。
    updateGhost(hit ? hit.pane : null);
    if (!hit) {
      dropTarget = null;
      hideAllIndicators();
      return;
    }
    dropTarget = { pane: hit.pane, slot: hit.slot };
    const elements = indicatorElements();
    for (const pane of ['left', 'center', 'right'] as ColumnPane[]) {
      const el = elements[pane];
      if (!el) continue;
      if (pane === hit.pane) {
        el.style.left = `${hit.leftPx}px`;
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    }
  };

  // rAF 端 autoscroll(共有スクロールコンテナ。水平方向のみ。13-B3-6)。
  const autoScrollTick = () => {
    // ゾンビ化防止の自己停止ガード。ドラッグ終了済みなら次フレームを予約せず終了します(13-B3-7)。
    if (draggingKey === null) {
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
          pointer.x,
          contentBox.left,
          contentBox.right,
          AUTO_SCROLL_EDGE_THRESHOLD,
        );
        const nextLeft = computeNextScrollPosition(
          el.scrollLeft,
          direction,
          AUTO_SCROLL_STEP,
          el.scrollWidth - el.clientWidth,
        );
        if (nextLeft !== el.scrollLeft) {
          el.scrollTo({ left: nextLeft, behavior: 'auto' });
        }
      }
    }
    // 端スクロールで rect が動くため、停止中の指でも毎フレーム slot を再計算します。
    updateIndicator();
    rafId = requestAnimationFrame(autoScrollTick);
  };

  const endDrag = (commit: boolean) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    document.body.style.cursor = '';
    hideAllIndicators();
    destroyGhost();

    const draggedKey = draggingKey;
    const target = dropTarget;
    draggingKey = null;
    dropTarget = null;

    if (!commit || !draggedKey || !target || args === null) return;

    const { columns, applyColumnOrderAndPin, scrollContainerRef } = args;
    const keys = computeHeaderReorderedKeys(columns, draggedKey, target.pane, target.slot);
    if (!keys) return; // no-op ドラッグ(同一 pane・同一 slot)

    // same-pane(ピン変更なし)の並べ替えのみ settle アニメを準備します(cross-pane はペイン幅 / 位置が変わり
    //   クリップが生じ得るためスナップ。reduced-motion もスナップ)。capture は commit 前に行います。
    const draggedColumn = columns.find((column) => column.key === draggedKey);
    const sourcePane = draggedColumn ? getColumnPane(draggedColumn) : null;
    const samePaneReorder = sourcePane !== null && sourcePane === target.pane;
    settlePending =
      samePaneReorder && !prefersReducedMotion() ? captureColumnLefts(scrollContainerRef.current) : null;

    const pinOverride = new Map<string, GridColumnPinned | undefined>([
      [draggedKey, target.pane === 'center' ? undefined : target.pane],
    ]);
    applyColumnOrderAndPin(keys, pinOverride);
  };

  // 並べ替え確定後(commit 済みの DOM)に呼ばれ、各列セルへ FLIP を 1 回当てて「新しい位置へスライド」させます。
  const applyReorderSettle = () => {
    const before = settlePending;
    settlePending = null;
    if (!before) return;
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return;

    const cellsByKey = new Map<string, HTMLElement[]>();
    const newLeftByKey = new Map<string, number>();
    container.querySelectorAll<HTMLElement>('[data-ssg-col-key]').forEach((cell) => {
      if (isInsideDetailCardOf(container, cell)) return;
      const key = cell.dataset.ssgColKey;
      if (!key || !before.has(key)) return;
      const arr = cellsByKey.get(key);
      if (arr) {
        arr.push(cell);
      } else {
        cellsByKey.set(key, [cell]);
        newLeftByKey.set(key, cell.getBoundingClientRect().left);
      }
    });

    // FLIP: 各列 delta = oldX - newX。動いた列だけ「逆 transform」で一旦元位置へ見せます。
    const animatedCells: HTMLElement[] = [];
    cellsByKey.forEach((cells, key) => {
      const oldX = before.get(key);
      const newX = newLeftByKey.get(key);
      if (oldX === undefined || newX === undefined) return;
      const delta = oldX - newX;
      if (Math.abs(delta) < 0.5) return;
      for (const cell of cells) {
        cell.style.transition = 'none';
        cell.style.transform = `translateX(${delta}px)`;
        cell.style.willChange = 'transform';
        animatedCells.push(cell);
      }
    });
    if (animatedCells.length === 0) return;

    // 初期(逆 transform)を確定させるため 1 回だけ強制リフロー。
    void container.getBoundingClientRect();
    for (const cell of animatedCells) {
      cell.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      cell.style.transform = 'translateX(0)';
    }
    // 後始末: インライン style を消します(次のドラッグ / 再レンダーと競合させない)。
    window.setTimeout(() => {
      for (const cell of animatedCells) {
        cell.style.transition = '';
        cell.style.transform = '';
        cell.style.willChange = '';
      }
    }, SETTLE_MS + 80);
  };

  const onColumnDragHandlePointerDown = (column: GridColumn<T>, event: ColumnDragHandlePointerEvent) => {
    if (args === null || !args.enabled) return;
    if (event.button !== 0) return;
    // ヘッダー本体の列範囲選択(onColumnHeaderPointerDown)へ伝播させない(掴み手方式)。
    event.stopPropagation();
    event.preventDefault();

    draggingKey = column.key;
    pointer = { x: event.clientX, y: event.clientY };
    dragOrigin = { x: event.clientX, y: event.clientY };
    autoScrollArmed = false;
    document.body.style.cursor = 'grabbing';
    createGhost(column.title || column.key);

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    // capture は「グリップ存命中」の保護(スクロールバー等へのイベント横取り防止)として維持しますが、
    //   リスナーの付け先は window です(13-B3-7。仮想化で grip が unmount しても pointerup を受けられる)。
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
      activeDragDispose = null;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* noop(グリップが unmount 済みでも無害) */
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

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    activeDragDispose = cleanup;

    updateIndicator();
    rafId = requestAnimationFrame(autoScrollTick);
  };

  return {
    update: (next) => {
      args = next;
    },
    onColumnDragHandlePointerDown,
    applyReorderSettle,
    // 最終後始末ネット(13-B3-3 / 13-B3-7): ドラッグ中に破棄されても window リスナー / rAF / body cursor /
    //   ゴーストを確実に解放します。
    dispose: () => {
      activeDragDispose?.();
      activeDragDispose = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      draggingKey = null;
      dropTarget = null;
      document.body.style.cursor = '';
      destroyGhost();
    },
  };
};