// 追加(非依存化 ③-1): カスタムツールチップのコントローラです(React 非依存。旧 hooks/useGridTooltip の
//   本体をそのまま移設)。title 属性のブラウザ標準ツールチップを置き換えます。
//
// 仕組み:
//   - 表示対象は `data-ssg-tooltip="文言"` 属性(静的)または `data-ssg-tooltip-overflow`(省略時のみ
//     全文表示のマーカー)を持つ要素です。window の pointerover / focusin(capture)委譲 + closest() で
//     拾うため、グリッド内・ポータル(popover / panel / menu)内のどちらでも 1 系統で動きます。
//   - 表示要素は body 直下シングルトンの `.ssg-tooltip` 1 枚です。複数グリッドが同居しても
//     モジュールスコープの refCount で共有し、最後の dispose で撤去します(文言は data 属性から
//     都度読むため、インスタンス別の状態は不要です)。
//   - 表示は SHOW_DELAY_MS 遅延。一度表示した後 WARMUP_MS 以内の連続 hover は即時表示します。
//     位置計算は logic/tooltipGeometry.ts の純関数です。
//   - 非表示条件: 対象からの pointerout / focusout・pointerdown・scroll(capture)・Escape。
//     Escape は window keydown capture で拾いますが、hide のみで stopPropagation しません
//     (POP-KEY の popover close 系と干渉させないため)。
//   - classNames.tooltip(slot)は setSlot で反映します。要素は共有のため、複数グリッド同居時は
//     最後に setSlot したグリッドの値が使われます。
//
// 使い方(フレームワーク側のアダプタ):
//   const controller = acquireTooltipController(slot);   // マウント時(refCount +1、初回でリスナー設置)
//   controller.setSlot(nextSlot);                          // スロット変更時
//   controller.dispose();                                  // アンマウント時(refCount -1、最後で撤去)
//   React 版は hooks/useGridTooltip.ts(useEffect 2 本)。Solid 版は onMount / onCleanup / createEffect。
//
// 既知の制約(実機確認ポイント):
//   - `disabled` 属性付きフォーム要素上の pointer イベントはブラウザ差があります(近年の
//     Chrome / Edge は pointerover が発火・旧挙動のブラウザは抑止)。
import { computeTooltipPlacement } from '../logic/tooltipGeometry';
import { applySlotToElement, type AppliedSlot } from '../logic/slotDom';
import type { GridResolvedSlot } from '../model/gridTypes.unbound';

const TOOLTIP_ATTRIBUTE = 'data-ssg-tooltip';
const TOOLTIP_OVERFLOW_ATTRIBUTE = 'data-ssg-tooltip-overflow';
const TOOLTIP_SELECTOR = `[${TOOLTIP_ATTRIBUTE}], [${TOOLTIP_OVERFLOW_ATTRIBUTE}]`;
const SHOW_DELAY_MS = 350;
const WARMUP_MS = 800;

export type TooltipController = {
  // classNames.tooltip の反映(共有要素へ。生成前なら生成時に適用)。
  setSlot: (slot: GridResolvedSlot | undefined) => void;
  // 参照を 1 つ返します。最後の dispose でリスナーと要素を撤去します。2 回呼んでも 2 回目は no-op。
  dispose: () => void;
};

// モジュールスコープの共有状態です(シングルトン。複数グリッド同居時は refCount で共有)。
let refCount = 0;
let tooltipEl: HTMLDivElement | null = null;
let showTimerId: number | null = null;
let warmupUntil = 0;
let currentTarget: Element | null = null;
let tooltipSlot: GridResolvedSlot | undefined;
let appliedTooltipSlot: AppliedSlot | undefined;

function syncTooltipSlot(el: HTMLDivElement) {
  appliedTooltipSlot = applySlotToElement(el, tooltipSlot, appliedTooltipSlot);
}

function ensureTooltipElement(): HTMLDivElement {
  if (tooltipEl !== null) {
    return tooltipEl;
  }
  const el = document.createElement('div');
  el.className = 'ssg-tooltip';
  // スクリーンリーダーには読ませません(文言は対象側の aria-label / テキストが担うため)。
  el.setAttribute('aria-hidden', 'true');
  appliedTooltipSlot = undefined;
  syncTooltipSlot(el);
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

function clearShowTimer() {
  if (showTimerId !== null) {
    window.clearTimeout(showTimerId);
    showTimerId = null;
  }
}

function hideTooltip() {
  clearShowTimer();
  if (currentTarget !== null) {
    // 表示中からの hide のみウォームアップを開始します(未表示の hide で延長しないため)。
    warmupUntil = Date.now() + WARMUP_MS;
  }
  currentTarget = null;
  if (tooltipEl !== null) {
    tooltipEl.classList.remove('ssg-tooltip--visible');
  }
}

function showTooltipFor(target: Element) {
  // 静的 data-ssg-tooltip があればその値を、無ければ overflow マーカーとみなし textContent を使います。
  const staticText = target.getAttribute(TOOLTIP_ATTRIBUTE);
  const text =
    staticText !== null && staticText !== ''
      ? staticText
      : (target.textContent ?? '').trim();
  if (text === '') {
    return;
  }
  const el = ensureTooltipElement();
  // 表示対象の祖先(.ssg-theme-dark)からテーマを解決します(複数グリッドがテーマ混在でも
  //   「hover した要素側のテーマ」で表示)。
  el.classList.toggle(
    'ssg-theme-dark',
    target.closest('.ssg-theme-dark') !== null,
  );
  el.textContent = text;
  // 実寸(offsetWidth/Height)を得るため、いったん原点へ置いてから配置します。
  el.style.left = '0px';
  el.style.top = '0px';
  const placement = computeTooltipPlacement({
    targetRect: target.getBoundingClientRect(),
    tipWidth: el.offsetWidth,
    tipHeight: el.offsetHeight,
    viewportWidth: window.innerWidth,
  });
  el.style.left = `${placement.left}px`;
  el.style.top = `${placement.top}px`;
  el.classList.add('ssg-tooltip--visible');
  currentTarget = target;
}

function handlePointerOverOrFocusIn(event: Event) {
  const node = event.target;
  if (!(node instanceof Element)) {
    return;
  }
  const target = node.closest(TOOLTIP_SELECTOR);
  if (target === null || target === currentTarget) {
    return;
  }
  // overflow マーカーだけの要素は、実際に省略(クリップ)されているときだけ表示します。
  if (
    !target.hasAttribute(TOOLTIP_ATTRIBUTE) &&
    target.scrollWidth <= target.clientWidth + 1
  ) {
    return;
  }
  const wasVisible = currentTarget !== null;
  hideTooltip();
  if (wasVisible || Date.now() < warmupUntil) {
    showTooltipFor(target);
  } else {
    showTimerId = window.setTimeout(() => {
      showTimerId = null;
      showTooltipFor(target);
    }, SHOW_DELAY_MS);
  }
}

function handlePointerOutOrFocusOut(event: Event) {
  const node = event.target;
  if (!(node instanceof Element)) {
    return;
  }
  const target = node.closest(TOOLTIP_SELECTOR);
  if (target === null) {
    return;
  }
  // 対象内部への移動(子要素間)では閉じません。
  const related = (event as PointerEvent | FocusEvent).relatedTarget;
  if (related instanceof Node && target.contains(related)) {
    return;
  }
  hideTooltip();
}

function handleGlobalHide() {
  hideTooltip();
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    hideTooltip();
  }
}

function installListeners() {
  window.addEventListener('pointerover', handlePointerOverOrFocusIn, true);
  window.addEventListener('pointerout', handlePointerOutOrFocusOut, true);
  window.addEventListener('focusin', handlePointerOverOrFocusIn, true);
  window.addEventListener('focusout', handlePointerOutOrFocusOut, true);
  window.addEventListener('pointerdown', handleGlobalHide, true);
  window.addEventListener('scroll', handleGlobalHide, true);
  window.addEventListener('keydown', handleKeyDown, true);
}

function uninstallListeners() {
  window.removeEventListener('pointerover', handlePointerOverOrFocusIn, true);
  window.removeEventListener('pointerout', handlePointerOutOrFocusOut, true);
  window.removeEventListener('focusin', handlePointerOverOrFocusIn, true);
  window.removeEventListener('focusout', handlePointerOutOrFocusOut, true);
  window.removeEventListener('pointerdown', handleGlobalHide, true);
  window.removeEventListener('scroll', handleGlobalHide, true);
  window.removeEventListener('keydown', handleKeyDown, true);
}

export function acquireTooltipController(
  slot?: GridResolvedSlot,
): TooltipController {
  refCount += 1;
  if (refCount === 1) {
    installListeners();
  }
  let disposed = false;
  const setSlot = (next: GridResolvedSlot | undefined) => {
    tooltipSlot = next;
    if (tooltipEl !== null) {
      syncTooltipSlot(tooltipEl);
    }
  };
  setSlot(slot);
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    refCount -= 1;
    if (refCount === 0) {
      uninstallListeners();
      clearShowTimer();
      currentTarget = null;
      if (tooltipEl !== null) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    }
  };
  return { setSlot, dispose };
}