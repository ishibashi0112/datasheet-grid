// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-32): ポップオーバーの中で Tab を回すための、次にフォーカスする要素です。
//   列フィルターのポップオーバーは body 直下にあり、最後のボタンの次の Tab でページの先頭へ出て、開いたまま残っていました
//   (外へ出た後は Esc でも閉じない)。最後の要素で Tab なら先頭へ、先頭で Shift+Tab なら最後へ回します。
//   それ以外はブラウザの既定の移動に任せます(null)。

// Tab で止まりうる要素です(tabIndex が負の要素は後で外します)。
const TABBABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([disabled])';

const listTabbable = (container: Element): HTMLElement[] => {
  const all = Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0,
  );
  // 見えていない要素(display: none の中)は飛ばします。レイアウトの無い環境(jsdom)ではどれも矩形が無いので、
  //   見えている要素が 1 つも無ければ全部を使います。
  const visible = all.filter((element) => element.getClientRects().length > 0);
  return visible.length > 0 ? visible : all;
};

export const resolveFocusWrapTarget = (
  container: Element,
  active: Element | null,
  backwards: boolean,
): HTMLElement | null => {
  if (active === null || !container.contains(active)) {
    return null;
  }
  const items = listTabbable(container);
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  const index = items.indexOf(active as HTMLElement);
  if (index !== -1) {
    if (!backwards && index === items.length - 1) {
      return first;
    }
    if (backwards && index === 0) {
      return last;
    }
    return null;
  }
  // 一覧に無い要素(tabindex="-1" のボタン等)にフォーカスがあるとき: 文書の順で先 / 前に止まる要素が無ければ回します。
  const position = (element: HTMLElement) => active.compareDocumentPosition(element);
  if (!backwards) {
    return items.some((element) => (position(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ? null : first;
  }
  return items.some((element) => (position(element) & Node.DOCUMENT_POSITION_PRECEDING) !== 0) ? null : last;
};