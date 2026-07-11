// 追加(TT-1 / カスタムツールチップ): title 属性のブラウザ標準ツールチップを置き換える
//   表示制御フックです。SpreadsheetGrid 本体から 1 回呼びます。
//
// 仕組み:
//   - 表示対象は `data-ssg-tooltip=\"文言\"` 属性を持つ要素です。window の pointerover /
//     focusin(capture)委譲 + closest() で拾うため、グリッド内・ポータル(popover / panel /
//     menu)内のどちらでも 1 系統で動きます(本プロジェクトの window リスナー作法に準拠)。
//   - 表示要素は body 直下シングルトンの `.ssg-tooltip` 1 枚です。複数グリッドが同居しても
//     モジュールスコープの refCount で共有し、最後のアンマウントで撤去します(文言は
//     data 属性から都度読むため、インスタンス別の状態は不要です)。
//   - 表示は SHOW_DELAY_MS 遅延。一度表示した後 WARMUP_MS 以内の連続 hover は即時表示します
//     (Mantine 等と同じ操作感)。位置計算は logic/tooltipGeometry.ts の純関数です。
//   - 非表示条件: 対象からの pointerout / focusout・pointerdown・scroll(capture)・Escape。
//     Escape は window keydown capture で拾いますが、hide のみで stopPropagation しません
//     (POP-KEY の popover close 系と干渉させないため)。
//
// 既知の制約(実機確認ポイント):
//   - `disabled` 属性付きフォーム要素上の pointer イベントはブラウザ差があります(近年の
//     Chrome / Edge は pointerover が発火・旧挙動のブラウザは抑止)。disabled 時の説明
//     ツールチップ(「非表示列のため…」等)が出ないブラウザがあれば、該当ボタンのみ
//     wrapper 方式へ切り替える後続対応とします。
import { useEffect } from 'react';
import { computeTooltipPlacement } from '../logic/tooltipGeometry';

const TOOLTIP_ATTRIBUTE = 'data-ssg-tooltip';
// 追加(overflow tooltip): 省略(…)されているときだけ全文を表示するセル用のマーカー属性です。
//   静的な data-ssg-tooltip と違い、文言は要素の textContent、表示可否はホバー時の実クリップ判定
//   (scrollWidth > clientWidth)で決めます(GridBodyLayer が既定テキストセルへ付与)。
const TOOLTIP_OVERFLOW_ATTRIBUTE = 'data-ssg-tooltip-overflow';
const TOOLTIP_SELECTOR = `[${TOOLTIP_ATTRIBUTE}], [${TOOLTIP_OVERFLOW_ATTRIBUTE}]`;
const SHOW_DELAY_MS = 350;
const WARMUP_MS = 800;

// モジュールスコープの共有状態です(シングルトン。複数グリッド同居時は refCount で共有)。
let refCount = 0;
let tooltipEl: HTMLDivElement | null = null;
let showTimerId: number | null = null;
let warmupUntil = 0;
let currentTarget: Element | null = null;

function ensureTooltipElement(): HTMLDivElement {
  if (tooltipEl !== null) {
    return tooltipEl;
  }
  const el = document.createElement('div');
  el.className = 'ssg-tooltip';
  // スクリーンリーダーには読ませません(文言は対象側の aria-label / テキストが担うため、
  // 二重読み上げを避けます)。
  el.setAttribute('aria-hidden', 'true');
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
  // 追加(TH-DK-2): 表示対象の祖先(.ssg-theme-dark = グリッド root またはダーク化した
  //   ポータル root)からテーマを解決します。tooltip はグリッド横断のシングルトンのため、
  //   複数グリッドがテーマ混在していても「hover した要素側のテーマ」で表示されます。
  el.classList.toggle(
    'ssg-theme-dark',
    target.closest('.ssg-theme-dark') !== null,
  );
  el.textContent = text;
  // 実寸(offsetWidth/Height)を得るため、いったん原点へ置いてから配置します
  // (opacity 0 のまま座標だけ動かすので、ちらつきはありません)。
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
  // overflow マーカー(静的 data-ssg-tooltip は持たない)は、実際にクリップされている
  //   (scrollWidth > clientWidth)ときだけ対象にします。非クリップ時は何も出しません。
  if (
    !target.hasAttribute(TOOLTIP_ATTRIBUTE) &&
    target.scrollWidth <= target.clientWidth + 1
  ) {
    return;
  }
  const wasVisible = currentTarget !== null;
  hideTooltip();
  if (wasVisible || Date.now() < warmupUntil) {
    // 表示中の乗り換え / ウォームアップ内は即時表示します。
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
  // 対象の内側要素間の移動(relatedTarget が対象内)は無視します。
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
    // hide のみ。preventDefault / stopPropagation はしません(popover close を妨げないため)。
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

export function useGridTooltip() {
  useEffect(() => {
    refCount += 1;
    if (refCount === 1) {
      installListeners();
    }
    return () => {
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
  }, []);
}