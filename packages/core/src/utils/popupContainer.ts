// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-07): ポップアップ(列メニュー / 列フィルター / 右クリックメニュー / select の候補 /
//   ツールパネル / フィルハンドルのメニュー / ツールチップ / ドラッグのゴースト)を描く場所です。
//
// 背景: ポップアップは document.body の直下に出していたため、モーダルの中のグリッドで使えませんでした。
//   - `<dialog>.showModal()` / popover はトップレイヤーなので、body の直下の要素はその後ろに隠れる。
//   - Radix(shadcn)/ React Aria(HeroUI)/ Headless UI のダイアログは、外側のポインタを止め(body に pointer-events: none)、
//     フォーカスを中に閉じ込め、外側の押下で閉じるため、body の直下のポップアップを押せない / 入力できない。
//   既定('auto')では、グリッドを囲むダイアログ(`<dialog>` / popover / `aria-modal="true"` / role が dialog・alertdialog)の
//   中へ描きます。Radix のダイアログとポップオーバーは aria-modal を付けないので role で見ます。
//
// 位置: ポップアップは position: fixed で、画面の座標(getBoundingClientRect)で位置を決めます。描く場所の祖先に transform /
//   translate などがあると(shadcn の DialogContent は translate で真ん中に置く)、fixed の基準が画面ではなくその要素になり、
//   その分だけずれます。syncPopupOrigin がその基準の原点を測り、ポップアップの `translate` で打ち消します(ポップアップが
//   アニメーションに使う transform とは別のプロパティなので重なっても壊れない)。拡大縮小(scale)は打ち消しません。
//   基準の要素が overflow で切る場合は、ポップアップもその中で切れます(そのときは popupContainer で別の場所を指定する)。
// 変更(1.1.0 の見直し): 囲むダイアログ(`<dialog>` / popover 以外)が overflow で切り、しかも fixed の基準になる(transform など)
//   ときは、その外側でいちばん近い position: fixed の祖先(body より内側で、自分は切らないもの)へ描きます。Mantine の Modal は
//   中身の section(role="dialog" + aria-modal)に transform と overflow-y: auto があり、その中では列フィルターなどが枠で切れて
//   いたため、外側の `.mantine-Modal-inner`(position: fixed)へ出します(Modal のスクロール止めとフォーカスの閉じ込めの範囲の中)。
//   そうした祖先が無ければ(Radix のように中身自身が fixed)、囲むダイアログの中のまま。`<dialog>` / popover はトップレイヤーなので
//   外へ出しません。ポップアップの root には pointer-events: auto を付けてあります(Mantine の inner は pointer-events: none)。

import type { GridPopupContainer } from '../model/gridTypes.core';

export type { GridPopupContainer };

// グリッドを囲むと、その中へ描く要素です。
const POPUP_HOST_SELECTOR = 'dialog, [popover], [aria-modal="true"], [role="dialog"], [role="alertdialog"]';
// グリッドのポップアップの root です(この中の要素のツールチップは、そのポップアップと同じ場所へ)。
const POPUP_ROOT_SELECTOR =
  '.ssg-menu-panel, .ssg-filter-popover, .ssg-toolpanel, .ssg-select-editor-popover, .ssg-popover';

const isElementNode = (value: unknown): value is HTMLElement =>
  typeof value === 'object' && value !== null && (value as { nodeType?: unknown }).nodeType === 1;

const bodyOf = (element: Element | null | undefined): HTMLElement | null => {
  const doc = element?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  return doc?.body ?? null;
};

const CONTAINING_BLOCK_WILL_CHANGE = /transform|translate|scale|rotate|perspective|filter/;
const CONTAINING_BLOCK_CONTAIN = /paint|layout|strict|content/;

// fixed の子孫の基準になり(transform など)、しかも overflow で切る要素か。
const isClippingContainingBlock = (element: HTMLElement): boolean => {
  const view = element.ownerDocument.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') {
    return false;
  }
  const style = view.getComputedStyle(element);
  const clips = (style.overflowX || 'visible') !== 'visible' || (style.overflowY || 'visible') !== 'visible';
  if (!clips) {
    return false;
  }
  const isNone = (value: string | undefined): boolean => !value || value === 'none';
  return (
    !isNone(style.transform) ||
    !isNone(style.getPropertyValue('translate')) ||
    !isNone(style.getPropertyValue('scale')) ||
    !isNone(style.getPropertyValue('rotate')) ||
    !isNone(style.filter) ||
    !isNone(style.perspective) ||
    !isNone(style.getPropertyValue('backdrop-filter')) ||
    CONTAINING_BLOCK_WILL_CHANGE.test(style.willChange || '') ||
    CONTAINING_BLOCK_CONTAIN.test(style.contain || '') ||
    (style.getPropertyValue('container-type') || 'normal') !== 'normal'
  );
};

// 囲むダイアログが切る基準のとき、その外側の position: fixed の祖先です(上の「変更(1.1.0 の見直し)」)。
const escapeClippingHost = (host: HTMLElement): HTMLElement => {
  if (host.matches('dialog, [popover]') || !isClippingContainingBlock(host)) {
    return host;
  }
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  for (let node = host.parentElement; node !== null && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
    if (node.matches('dialog, [popover]')) {
      return host;
    }
    if (view?.getComputedStyle(node).position === 'fixed') {
      return isClippingContainingBlock(node) ? host : node;
    }
  }
  return host;
};

// グリッドを囲むダイアログです(グリッド自身のポップアップは見ない = グリッドはポップアップの中に無い)。
export function findPopupHost(element: Element): HTMLElement | null {
  const host = element.parentElement?.closest(POPUP_HOST_SELECTOR);
  return isElementNode(host) ? escapeClippingHost(host) : null;
}

// 描く場所を決めます。グリッドの要素がまだ無いとき(描く前)は body。
export function resolvePopupContainer(
  gridElement: HTMLElement | null | undefined,
  option: GridPopupContainer | undefined,
): HTMLElement | null {
  const body = bodyOf(gridElement);
  if (isElementNode(option)) {
    return option;
  }
  if (!gridElement) {
    return body;
  }
  if (typeof option === 'function') {
    return option(gridElement) ?? body;
  }
  if (option === 'body') {
    return body;
  }
  return findPopupHost(gridElement) ?? body;
}

// グリッドの要素ごとの「描く場所を返す関数」です(シェルが登録し、ツールチップとドラッグのゴーストが引く)。
const registry = /* @__PURE__ */ new WeakMap<Element, () => HTMLElement | null>();

export function registerPopupContainer(elements: readonly (Element | null | undefined)[], get: () => HTMLElement | null): () => void {
  const registered = elements.filter((element): element is Element => element != null);
  for (const element of registered) {
    registry.set(element, get);
  }
  return () => {
    for (const element of registered) {
      if (registry.get(element) === get) {
        registry.delete(element);
      }
    }
  };
}

// ある要素(ツールチップの対象 / ドラッグを始めた表)のポップアップを描く場所です。ポップアップの中の要素ならそのポップアップと
//   同じ場所、登録したグリッドの中ならその表の設定、どちらでもなければ 'auto' と同じ決め方。
export function getPopupContainerFor(element: Element | null | undefined): HTMLElement | null {
  for (let node: Element | null = element ?? null; node !== null; node = node.parentElement) {
    if (node.matches(POPUP_ROOT_SELECTOR)) {
      return node.parentElement ?? bodyOf(node);
    }
    const get = registry.get(node);
    if (get) {
      return get() ?? bodyOf(node);
    }
  }
  if (!element) {
    return bodyOf(null);
  }
  return findPopupHost(element) ?? bodyOf(element);
}

// ポップアップの fixed の基準の原点(画面の座標)を測り、`translate` で打ち消します(上の「位置」)。描く場所が body なら
//   測らず、前に書いた値だけを外します。
export function syncPopupOrigin(popup: HTMLElement | null | undefined): void {
  const parent = popup?.parentElement;
  if (!popup || !parent) {
    return;
  }
  const doc = popup.ownerDocument;
  let x = 0;
  let y = 0;
  if (parent !== doc.body && parent !== doc.documentElement) {
    const probe = doc.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none';
    parent.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    x = Number.isFinite(rect.left) ? rect.left : 0;
    y = Number.isFinite(rect.top) ? rect.top : 0;
  }
  const value = x === 0 && y === 0 ? '' : `${-x}px ${-y}px`;
  if (popup.style.getPropertyValue('translate') !== value) {
    if (value === '') {
      popup.style.removeProperty('translate');
    } else {
      popup.style.setProperty('translate', value);
    }
  }
}

// ポップアップを描く場所へ入れます(もう入っていれば動かさない)。命令的に作る要素(ツールチップ / ゴースト)用。
export function appendToPopupContainer(popup: HTMLElement, container: HTMLElement | null): void {
  const target = container ?? popup.ownerDocument.body;
  if (popup.parentElement !== target) {
    target.appendChild(popup);
  }
  syncPopupOrigin(popup);
}