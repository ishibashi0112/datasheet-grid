// 追加(非依存化 ③-19): 行ドラッグ並び替えのコントローラです(React 非依存。旧 hooks/useRowDragController の本体を
//   移設)。列ヘッダー D&D(columnHeaderDragController)と同じ設計方針を縦方向へ適用しています。
//   - ドラッグ中はフレームワークの state を更新しません。ガイド線(各ペインに常設した水平線。args の indicator
//     ref 経由)とゴースト(body 直下の fixed ピル)を imperative に動かします(再レンダーゼロ)。
//   - pointerdown(ハンドル)→ window に pointermove / pointerup / pointercancel / keydown(Escape)/ blur を登録
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
  clampClientYAboveFooter,
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from '../logic/autoScrollGeometry';
import { isInsideDetailCardOf } from '../logic/detailRow';
import { syncPortalTokens } from '../utils/portalTokens';
import { applySlotToElement } from '../logic/slotDom';
import type { GridResolvedSlot } from '../model/gridTypes.unbound';

type ReadonlyRef<V> = { readonly current: V };

export type RowDragArgs = {
  // 操作可能(利用可能 かつ 表示順が恒等)のときだけ true。false ならドラッグ開始しません。
  enabled: boolean;
  // 行メトリクス(スロット解決 / ガイド線 y の基準)。
  rowMetrics: RowMetrics;
  headerHeight: number;
  // 追加(合計行 3A): 下端に固定する行(合計行)の高さ。端の自動スクロールの下の帯をその上端へ寄せ、合計行の上の
  //   ポインタは本体の見えている最後の位置として扱います(合計行の裏の位置へ落とさない)。既定 0(従来どおり)。
  footerHeight?: number;
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
  // 追加(motion-8 / M-11): 表示方式。'ghost'(既定 = 従来: ゴースト + ガイド線、ドロップ後にスライド)/ 'live'(掴んだ
  //   行がポインタに追従し、通る先の行がその場で上下へ退避する。ガイド線 / ゴーストは出さない)。スロット解決は共通。
  motion?: 'ghost' | 'live';
  // 追加(1.0 前の最終チェック FC-12): 掴んだ行を離すときに今の行の並びで探し直すための関数です。getDragRow は掴んだときの
  //   行の控え(中身は呼び出し側が決める)、locateDragRow はその行の今の view index(見つからなければ null = ドロップを
  //   取り消す)。未指定なら
  //   掴んだときの index のまま(従来どおり)。
  getDragRow?: (viewIndex: number) => unknown;
  locateDragRow?: (dragRow: unknown, hint: number) => number | null;
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
// 追加(motion-8 / M-11): live 方式で周りの行が退避するときの transition(短め。ドラッグに追従する感触を優先)。
const LIVE_SHIFT_MS = 160;
const LIVE_SHIFT_TRANSITION = `transform ${LIVE_SHIFT_MS}ms ${SETTLE_EASING}`;

// ドラッグ中の行(3 ペイン分)へ付ける属性です。フレームワークが管理しない属性なので、hover 等の再レンダーで
//   className が上書きされても消えません(CSS 側で淡色表示)。
const DRAGGING_ROW_ATTRIBUTE = 'data-ssg-row-dragging';

// 変更(motion-3): 抑制の判定を OS 設定(prefers-reduced-motion)の直接参照から motion prop の実効値(root の
//   .ssg-motion-off)へ。'auto' では同義、'on' では OS 設定に関わらずスライドします。
const isMotionOff = (el: HTMLElement | null): boolean => el?.closest('.ssg-motion-off') != null;

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

// 追加(dogfood DF-02): 展開行の帯(3 ペイン分。展開行カード内のネストしたグリッドの帯は除外)を、view index と位置を引く
//   キー(同じ index の帯はペインごとに 1 つずつあるので、DOM の順で何番目か)付きで列挙します。帯は行と違い `top` で置かれ
//   transform を持たないので、live 方式の追従 / 退避と確定後のスライドでは translateY を相対の移動量として当て、終わったら外します。
//   これまでは帯を動かさず、live 方式で展開中の行を掴むと帯が元の位置に残って、退避した後ろの行を覆っていました。
type DetailBandElement = { el: HTMLElement; index: number; key: string };
const collectDetailBandElements = (container: HTMLElement): DetailBandElement[] => {
  const result: DetailBandElement[] = [];
  const ordinals = new Map<number, number>();
  container.querySelectorAll<HTMLElement>('.ssg-detail-band[data-detail-row-index]').forEach((band) => {
    if (isInsideDetailCardOf(container, band)) return;
    const index = Number(band.getAttribute('data-detail-row-index'));
    const ordinal = ordinals.get(index) ?? 0;
    ordinals.set(index, ordinal + 1);
    result.push({ el: band, index, key: `band|${ordinal}|${index}` });
  });
  return result;
};
const resetDetailBandStyle = (band: HTMLElement) => {
  band.style.transition = '';
  band.style.transform = '';
  band.style.willChange = '';
  band.style.zIndex = '';
};

type RowDropHit = { slot: number; top: number };
type LiveBase = { index: number; baseY: number; applied?: string };

export const createRowDragController = (): RowDragController => {
  let args: RowDragArgs | null = null;

  // ドラッグセッション state。
  let draggingIndex: number | null = null;
  let dropSlot: number | null = null;
  let pointer = { x: 0, y: 0 };
  let dragOrigin: { x: number; y: number } | null = null;
  let autoScrollArmed = false;
  let activeDragDispose: (() => void) | null = null;
  // 追加(audit C-9): ドラッグ中のポインタ(2 本目のポインタで始め直さないため)。
  let activePointerId: number | null = null;
  let rafId: number | null = null;
  // settle(FLIP)用: commit 直前の各行要素の screen-y。
  // 変更(1.0 前の最終チェック FC-02): 要素ではなく「ペイン + view index」で持ち、確定した移動(from → to)も控えます。
  let settlePending: { tops: Map<string, number>; from: number; to: number; row: unknown } | null = null;
  // 追加(FC-12): 掴んだ行の控え(getDragRow の戻り値)。離すときに今の並びで探し直します。
  let draggingRow: unknown = null;
  // 追加(motion-8 / M-11): live 方式のドラッグ開始時の各行要素の translateY(基準)と scrollTop。
  //   applied は最後にこのコントローラが書いた transform(FC-12: ドラッグ中に React が書き直したかを見分ける)。
  let liveBases: Map<HTMLElement, LiveBase> | null = null;
  let liveStartScrollTop = 0;
  // 追加(dogfood DF-02): live 方式で transform を当てた展開行の帯(後始末で外す)。
  let liveBands: Set<HTMLElement> | null = null;

  const isLive = () => args?.motion === 'live';

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
    // 追加(段階 2 DU-13): theme="class" の表のゴーストも同じ修飾子(ダークかどうかは CSS が祖先の .dark で決める)。
    if (args?.scrollContainerRef.current?.closest('.ssg-theme-class') != null) {
      el.classList.add('ssg-theme-class');
    }
    // 追加(motion-0): モーション停止の修飾子もテーマと同じく祖先から引き継ぎます。
    if (args?.scrollContainerRef.current?.closest('.ssg-motion-off') != null) {
      el.classList.add('ssg-motion-off');
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
    // 追加(DevBI の報告): 表で決まったトークン(--ssg-*)をゴーストへ写します(body 直下のため継承で届かない)。
    syncPortalTokens(args?.scrollContainerRef.current, el);

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

  // ドラッグ中の行(3 ペイン分)の淡色表示属性を付け外しします(live 方式は値 'live' = 浮いた見た目)。
  //   変更(FC-12): 外すときは index でなく属性の付いた行をすべて外します(ドラッグ中に行の並びが変わると、付けた行の
  //   index が変わって外し漏れていた)。
  const setDraggingRowAttribute = (viewIndex: number | null, on: boolean) => {
    const container = args?.scrollContainerRef.current ?? null;
    if (!container || (on && viewIndex === null)) return;
    container
      .querySelectorAll<HTMLElement>(
        on ? `.ssg-body-row[data-row-index="${viewIndex}"]` : `.ssg-body-row[${DRAGGING_ROW_ATTRIBUTE}]`,
      )
      .forEach((row) => {
        if (isInsideDetailCardOf(container, row)) return;
        if (on) {
          row.setAttribute(DRAGGING_ROW_ATTRIBUTE, isLive() ? 'live' : '');
        } else {
          row.removeAttribute(DRAGGING_ROW_ATTRIBUTE);
        }
      });
  };

  // 追加(motion-8 / M-11): live 方式。描画中の行要素の基準 translateY を控えます(autoscroll で後から描画された行は
  //   applyLivePositions が取り込みます)。
  const captureLiveBases = (): Map<HTMLElement, LiveBase> | null => {
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return null;
    const map = new Map<HTMLElement, LiveBase>();
    for (const row of collectRowElements(container)) {
      const match = TRANSLATE_Y_PATTERN.exec(row.style.transform);
      if (!match) continue;
      map.set(row, { index: Number(row.getAttribute('data-row-index')), baseY: parseFloat(match[1]) });
    }
    return map;
  };

  // 追加(motion-8 / M-11): live 方式の位置更新。掴んだ行はポインタ(+ autoscroll ぶん)に追従し、from → target の間の行は
  //   掴んだ行の高さぶん上下へ退避します(transition 付き)。slot が null(枠外 / 直上直下)のときは退避を戻します。
  const applyLivePositions = (slot: number | null) => {
    const bases = liveBases;
    const from = draggingIndex;
    if (!bases || from === null || args === null) return;
    const container = args.scrollContainerRef.current;
    if (!container) return;
    for (const row of collectRowElements(container)) {
      if (bases.has(row)) continue;
      const match = TRANSLATE_Y_PATTERN.exec(row.style.transform);
      if (!match) continue;
      bases.set(row, { index: Number(row.getAttribute('data-row-index')), baseY: parseFloat(match[1]) });
    }
    const height = args.rowMetrics.rowsHeight(from, from);
    const scrollDelta = (container.scrollTop - liveStartScrollTop) * args.verticalScaleFactor;
    const dragDelta = (dragOrigin ? pointer.y - dragOrigin.y : 0) + scrollDelta;
    const target = slot === null ? null : resolveMoveTargetIndex(from, slot);
    bases.forEach((base, row) => {
      const { index, baseY } = base;
      if (!row.isConnected) {
        bases.delete(row);
        return;
      }
      if (index === from) {
        row.style.transition = 'none';
        row.style.transform = `translateY(${baseY + dragDelta}px)`;
        row.style.willChange = 'transform';
        base.applied = row.style.transform;
        return;
      }
      let shift = 0;
      if (target !== null) {
        if (from < index && index <= target) shift = -height;
        else if (target <= index && index < from) shift = height;
      }
      row.style.transition = LIVE_SHIFT_TRANSITION;
      row.style.transform = `translateY(${baseY + shift}px)`;
      base.applied = row.style.transform;
    });
    // 追加(dogfood DF-02): 展開行の帯も行と一緒に動かします(掴んだ行の帯は追従、間の行の帯は同じだけ退避)。
    const bands = liveBands ?? new Set<HTMLElement>();
    liveBands = bands;
    for (const { el, index } of collectDetailBandElements(container)) {
      bands.add(el);
      if (index === from) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dragDelta}px)`;
        el.style.willChange = 'transform';
        el.style.zIndex = '10';
        continue;
      }
      let shift = 0;
      if (target !== null) {
        if (from < index && index <= target) shift = -height;
        else if (target <= index && index < from) shift = height;
      }
      el.style.transition = LIVE_SHIFT_TRANSITION;
      el.style.transform = `translateY(${shift}px)`;
      el.style.zIndex = '';
    }
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
    //   変更(合計行 3A): 合計行の上のポインタは、本体の見えている最後の位置として扱います。
    const hitClientY = clampClientYAboveFooter(
      clientY,
      r.top + containerEl.clientTop + containerEl.clientHeight,
      args.footerHeight ?? 0,
    );
    const centerRect = centerEl.getBoundingClientRect();
    const physicalY = centerEl.scrollTop + hitClientY - centerRect.top - headerHeight;
    const d = containerEl.scrollTop * (1 - verticalScaleFactor);
    const logicalY = physicalY - d;
    let slot = resolveRowDropSlot(logicalY, rowMetrics);
    // 追加(アプリの再確認): live 方式で展開中の行(行 + 帯)を下へ引くときは、帯の高さぶん下の位置でスロットを決めます。
    //   ポインタは掴んだ行の上の方にあるので、ポインタの位置で決めると、空く隙間が掴んだ行 + 帯より帯の高さぶん上に
    //   ずれ、間の行が帯の裏に隠れていました(上へ引くとき・帯の無い行・ゴースト方式は従来どおり)。
    const from = draggingIndex;
    const detailExtra = from !== null && isLive() ? rowMetrics.detailHeight(from) : 0;
    if (from !== null && detailExtra > 0) {
      const downSlot = resolveRowDropSlot(logicalY + detailExtra, rowMetrics);
      if (downSlot > from + 1) {
        slot = downSlot;
      }
    }
    const slotTop = resolveRowDropSlotTop(slot, rowMetrics);
    return { slot, top: headerHeight + slotTop - windowBaseOffsetPx };
  };

  const updateIndicator = () => {
    const hit = computeHit(pointer.x, pointer.y);
    const from = draggingIndex;
    // 追加(motion-8 / M-11): live 方式はガイド線 / ゴーストを出さず、行そのものを動かします。枠外(hit なし)では直前の
    //   スロットを保ちます(離しても確定。ゴースト方式の「枠外 = キャンセル」とは違う)。
    if (isLive()) {
      if (hit && from !== null) {
        dropSlot = resolveMoveTargetIndex(from, hit.slot) === null ? null : hit.slot;
      }
      hideAllIndicators();
      applyLivePositions(dropSlot);
      return;
    }
    updateGhost(hit);
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
          contentBox.bottom - (args?.footerHeight ?? 0),
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

  // commit 直前の各行の screen-y を「ペイン + view index」で記録します(FLIP の before)。
  // 変更(1.0 前の最終チェック FC-02): 行要素ではなく view index で持ち、確定後は移動の前後の index の対応(from → to)で
  //   引きます。rowKeyGetter が無い(行キー = index)と React は行要素を index で使い回すので、要素で引くと別の行の位置から
  //   滑らせていた。
  const rowPositionKey = (row: HTMLElement, viewIndex: number): string =>
    `${row.getAttribute('data-pane') ?? ''}|${viewIndex}`;
  const captureRowTops = (): Map<string, number> | null => {
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return null;
    const map = new Map<string, number>();
    for (const row of collectRowElements(container)) {
      map.set(rowPositionKey(row, Number(row.getAttribute('data-row-index'))), row.getBoundingClientRect().top);
    }
    // 追加(dogfood DF-02): 展開行の帯も記録し、確定後に行と一緒に滑らせます。
    for (const band of collectDetailBandElements(container)) {
      map.set(band.key, band.el.getBoundingClientRect().top);
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

    // 変更(1.0 前の最終チェック FC-12): ドラッグ中に行の並びが変わったときは update(followDraggedRow)が draggingIndex を
    //   掴んだ行の今の位置へ直しているので、そのまま使います。
    const from = draggingIndex;
    const slot = dropSlot;
    const draggedRow = draggingRow;
    setDraggingRowAttribute(from, false);
    draggingIndex = null;
    draggingRow = null;
    dropSlot = null;
    dragOrigin = null;
    activePointerId = null;

    const to = from === null || slot === null ? null : resolveMoveTargetIndex(from, slot);
    const willCommit = commit && from !== null && to !== null && args !== null;

    // 追加(motion-8 / M-11): live 方式の後始末。確定するときは現在の画面位置(追従 / 退避済み)から settle します
    //   (captureRowTops が live 位置を読む)。確定しないときは基準位置へ戻します(transition 付き)。
    const bases = liveBases;
    liveBases = null;
    // 変更(FC-02): 確定するときは、今の画面位置(追従 / 退避済み)を記録してから transform を基準位置へ戻し(transition なし)、
    //   それから並びを反映します。transform を残したままだと、行キーが index のとき React が行要素を使い回して transform を
    //   書き直さず、確定後の画面の並びがデータとずれていた(見えている行と、クリックや入力で書き換わる行が違った)。
    const liveTops =
      bases && willCommit && args !== null && !isMotionOff(args.scrollContainerRef.current) ? captureRowTops() : null;
    // 追加(dogfood DF-02): 展開行の帯の transform も、確定するときはすぐ外し(確定後のスライドは applyReorderSettle)、
    //   取り消すときは元の位置へ戻してから外します。
    const bands = liveBands;
    liveBands = null;
    if (bands) {
      if (willCommit) {
        bands.forEach(resetDetailBandStyle);
      } else {
        bands.forEach((band) => {
          if (!band.isConnected) return;
          band.style.transition = LIVE_SHIFT_TRANSITION;
          band.style.transform = 'translateY(0px)';
          band.style.zIndex = '';
        });
        window.setTimeout(() => {
          bands.forEach((band) => {
            // 戻している間に次のドラッグが始まっていれば、そちらが当てた transform を消さない。
            if (liveBands?.has(band)) return;
            resetDetailBandStyle(band);
          });
        }, LIVE_SHIFT_MS + 40);
      }
    }
    if (bases) {
      if (willCommit) {
        bases.forEach(({ baseY }, row) => {
          row.style.transition = '';
          row.style.willChange = '';
          if (row.isConnected) {
            row.style.transform = `translateY(${baseY}px)`;
          }
        });
      } else {
        const restored: HTMLElement[] = [];
        bases.forEach(({ baseY }, row) => {
          if (!row.isConnected) return;
          row.style.transition = LIVE_SHIFT_TRANSITION;
          row.style.transform = `translateY(${baseY}px)`;
          restored.push(row);
        });
        window.setTimeout(() => {
          for (const row of restored) {
            row.style.transition = '';
            row.style.willChange = '';
          }
        }, LIVE_SHIFT_MS + 40);
      }
    }

    if (!willCommit || from === null || to === null || args === null) return;

    const tops = liveTops ?? (isMotionOff(args.scrollContainerRef.current) ? null : captureRowTops());
    const pending = tops ? { tops, from, to, row: draggedRow } : null;
    settlePending = pending;
    args.commitRowMove(from, to);
    // 変更(FC-31): 予約は確定の直後の 1 回だけ有効にします。利用側が並びを反映しない(断る / 非同期で後から反映する)と
    //   予約が残り、後の無関係なレイアウトの変化で古い位置から滑っていた。
    if (pending) {
      requestAnimationFrame(() => {
        if (settlePending === pending) {
          settlePending = null;
        }
      });
    }
  };

  // 並べ替え確定後(commit 済みの DOM)に呼ばれ、行要素へ FLIP を 1 回当てて「新しい位置へスライド」させます。
  //   行の縦位置は translateY(inline)なので、差分を合成した値から本体が設定した値へ transition します。
  const applyReorderSettle = () => {
    const pending = settlePending;
    settlePending = null;
    if (!pending) return;
    const container = args?.scrollContainerRef.current ?? null;
    if (!container) return;

    const { tops, from, to } = pending;
    // 変更(FC-02 の見直し): 掴んだ行が to に来ていなければ(利用側が並びを反映しなかったのに、同じフレームの再描画で rows の
    //   参照だけが変わった など)滑らせません。index の対応で引くので、並びが変わっていないと全部の行が誤って滑っていた。
    if (args?.locateDragRow && pending.row !== null && args.locateDragRow(pending.row, to) !== to) return;
    // 確定後の view index → 確定前の view index(from を to へ動かした並び)。
    const previousIndexOf = (index: number): number => {
      if (index === to) return from;
      if (from < to && index >= from && index < to) return index + 1;
      if (to < from && index > to && index <= from) return index - 1;
      return index;
    };
    const animated: HTMLElement[] = [];
    const targetYByRow = new Map<HTMLElement, number>();
    collectRowElements(container).forEach((row) => {
      const oldTop = tops.get(rowPositionKey(row, previousIndexOf(Number(row.getAttribute('data-row-index')))));
      if (oldTop === undefined) return;
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
    // 追加(dogfood DF-02): 展開行の帯も同じ対応で滑らせます(帯は transform を持たないので 0 へ戻し、終わったら外す)。
    const animatedBands: HTMLElement[] = [];
    collectDetailBandElements(container).forEach(({ el, index, key }) => {
      const previousIndex = previousIndexOf(index);
      const oldTop = tops.get(key.slice(0, key.lastIndexOf('|') + 1) + previousIndex);
      if (oldTop === undefined) return;
      const delta = oldTop - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      el.style.willChange = 'transform';
      animatedBands.push(el);
    });
    if (animated.length === 0 && animatedBands.length === 0) return;

    // 初期(逆 transform)を確定させるため 1 回だけ強制リフロー。
    void container.getBoundingClientRect();
    for (const row of animated) {
      row.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      row.style.transform = `translateY(${targetYByRow.get(row) ?? 0}px)`;
    }
    for (const band of animatedBands) {
      band.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      band.style.transform = 'translateY(0px)';
    }
    window.setTimeout(() => {
      for (const row of animated) {
        row.style.transition = '';
        row.style.willChange = '';
      }
      for (const band of animatedBands) {
        // 滑らせている間に live 方式の次のドラッグが始まっていれば、そちらが当てた transform を消さない。
        if (liveBands?.has(band)) continue;
        resetDetailBandStyle(band);
      }
    }, SETTLE_MS + 80);
  };

  const onRowDragHandlePointerDown = (viewIndex: number, event: RowDragHandlePointerEvent) => {
    if (args === null || !args.enabled) return;
    if (event.button !== 0) return;
    // セルの pointerdown(範囲選択 / アクティブ化)へ伝播させません(掴み手方式)。
    event.stopPropagation();
    event.preventDefault();

    // 修正(audit C-9): ドラッグ中に別のポインタ(2 本目の指 / ペン)でハンドルを押しても始めません(前のドラッグの
    //   rAF が止められなくなり、前のポインタを離したときに新しいドラッグの行で確定してしまうため)。同じポインタ
    //   (pointerup を取りこぼした等)なら前のドラッグを取り消してから始めます(列ドラッグと同じ)。
    if (draggingIndex !== null) {
      if (event.pointerId !== activePointerId) return;
      activeDragDispose?.();
      endDrag(false);
    }

    draggingIndex = viewIndex;
    draggingRow = args.getDragRow?.(viewIndex) ?? null;
    activePointerId = event.pointerId;
    dropSlot = null;
    pointer = { x: event.clientX, y: event.clientY };
    dragOrigin = { x: event.clientX, y: event.clientY };
    autoScrollArmed = false;
    document.body.style.cursor = 'grabbing';
    if (isLive()) {
      liveBases = captureLiveBases();
      liveStartScrollTop = args.scrollContainerRef.current?.scrollTop ?? 0;
    } else {
      createGhost(args.getRowDragLabel(viewIndex));
    }
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
      window.removeEventListener('blur', handleBlur);
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
    // 追加(audit C-8): ウィンドウがフォーカスを失ったら(Alt+Tab / OS の通知等)キャンセルします。pointerup を
    //   取りこぼしてもガイド線 / ゴースト / grabbing カーソル / 自動スクロールが残りません。
    function handleBlur() {
      cleanup();
      endDrag(false);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    activeDragDispose = cleanup;

    updateIndicator();
    rafId = requestAnimationFrame(autoScrollTick);
  };

  // 追加(1.0 前の最終チェック FC-12): ドラッグ中に行の並びが変わったら(ポーリング / 他の人の追加。update で locateDragRow が
  //   変わる)、掴んだ行を今の並びで探し直して追います(掴んだときの index のままだと、離したときに別の行を動かしていた)。
  //   見つからなければ(消えた)ドラッグを取り消します。live 方式は React が書き直した行の基準位置を取り直し、掴んだ行の
  //   index が変わったときはポインタの下に留まるよう起点をずらします。
  const followDraggedRow = (previousRowMetrics: RowDragArgs['rowMetrics'] | null) => {
    if (draggingIndex === null || draggingRow === null || draggingRow === undefined || args?.locateDragRow === undefined) {
      return;
    }
    const located = args.locateDragRow(draggingRow, draggingIndex);
    // 変更(FC-12 の見直し): 基準位置の取り直しは取り消しより先にします(先に取り消すと、React が新しい index で書いた
    //   transform をドラッグ開始時の古い基準位置で上書きし、後ろの行が 1 行ずれたまま残っていた)。
    if (liveBases) {
      liveBases.forEach((base, row) => {
        if (!row.isConnected) {
          liveBases?.delete(row);
          return;
        }
        const index = Number(row.getAttribute('data-row-index'));
        if (index === base.index && (base.applied === undefined || row.style.transform === base.applied)) return;
        const match = TRANSLATE_Y_PATTERN.exec(row.style.transform);
        if (!match) {
          liveBases?.delete(row);
          return;
        }
        base.index = index;
        base.baseY = parseFloat(match[1]);
        base.applied = undefined;
      });
    }
    if (located === null) {
      activeDragDispose?.();
      endDrag(false);
      return;
    }
    if (liveBases) {
      if (located !== draggingIndex && dragOrigin !== null && previousRowMetrics !== null) {
        dragOrigin = {
          x: dragOrigin.x,
          y: dragOrigin.y + args.rowMetrics.rowTop(located) - previousRowMetrics.rowTop(draggingIndex),
        };
      }
    }
    if (located !== draggingIndex) {
      setDraggingRowAttribute(null, false);
      draggingIndex = located;
      setDraggingRowAttribute(located, true);
    }
    updateIndicator();
  };

  return {
    update: (next) => {
      const previous = args;
      args = next;
      if (draggingIndex !== null && previous !== null && previous.locateDragRow !== next.locateDragRow) {
        followDraggedRow(previous.rowMetrics);
      }
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
      draggingRow = null;
      dropSlot = null;
      liveBases = null;
      liveBands?.forEach(resetDetailBandStyle);
      liveBands = null;
      settlePending = null;
    },
  };
};