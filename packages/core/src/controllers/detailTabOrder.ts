// 追加(段階 2 C-N2): 展開行のカードと Tab の順番です(React に依存しない DOM の処理)。
//   最終列で Tab を押すと、その行のカードが開いていればカードの中へ入り、カードの最後の要素でもう一度 Tab を押すと
//   表の外へ出ます。Shift+Tab はその逆順(カードの最初の要素 → その行の最終列のセル、表の後ろから戻ると今の行の
//   カードの最後の要素)。これまではブラウザの既定(DOM の順)で、画面の上の方にある別の行のカードへ入っていました。
//   表の外へ出すときは、keydown の既定動作の前にフォーカスを表の直後の目印(シェルの中、スクロールコンテナの直後)へ
//   移し、既定動作をそこから進めます(既定動作は今のフォーカスの位置から次へ進む。imeInputController と同じ手法)。
import { isInsideDetailCardOf } from '../logic/detailRow';

const TABBABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'summary',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

// container の中で Tab で止まる要素(DOM の順)。tabindex が負 / 無効 / hidden の input / inert の中 / 見えない要素を除きます
//   (見えるかどうかは checkVisibility がある環境だけで判定。無い環境(Safari 17.3 以前 / jsdom)はすべて見えるものとして扱う)。
export const listTabbableElements = (container: Element): HTMLElement[] => {
  const out: HTMLElement[] = [];
  for (const element of container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)) {
    if (element.tabIndex < 0) continue;
    if ((element as HTMLButtonElement).disabled === true) continue;
    if (element instanceof HTMLInputElement && element.type === 'hidden') continue;
    if (element.closest('[inert]') !== null) continue;
    if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) continue;
    out.push(element);
  }
  return out;
};

// その行の展開行のカード(中央のペインの帯の中。左右の固定ペインの帯はカードを持たない)。描画窓の外の行や、閉じている
//   行は null。入れ子のグリッド(カードの中のグリッド)のカードは数えません。
export const findDetailCard = (scrollContainer: HTMLElement, viewRowIndex: number): HTMLElement | null => {
  for (const band of scrollContainer.querySelectorAll<HTMLElement>(`[data-detail-row-index="${viewRowIndex}"]`)) {
    if (isInsideDetailCardOf(scrollContainer, band)) continue;
    const card = band.querySelector<HTMLElement>('[data-ssg-detail]');
    if (card !== null) return card;
  }
  return null;
};

// カードの中で、target より後(forward)/ 前(backward)に Tab で止まる要素が無いか(= カードの端)。target の子孫は後、
//   祖先は前として数えます(既定の Tab の順と同じ)。
export const isTabEdgeOfCard = (card: Element, target: Element, direction: 'forward' | 'backward'): boolean => {
  const mask = direction === 'forward' ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING;
  return !listTabbableElements(card).some(
    (element) => element !== target && (target.compareDocumentPosition(element) & mask) !== 0,
  );
};

// カードの最初 / 最後の Tab で止まる要素へフォーカスします。止まる要素が無ければ false。
export const focusDetailCardEdge = (card: Element, edge: 'first' | 'last'): boolean => {
  const tabbables = listTabbableElements(card);
  const target = edge === 'first' ? tabbables[0] : tabbables[tabbables.length - 1];
  if (target === undefined) {
    return false;
  }
  target.focus();
  return document.activeElement === target;
};