// 追加(1.5.0 / Solid 版の速さ): 行の要素の行のキー(data-row-key)が書き換わったこと(Solid 版が行の要素を別の行に使い回した)を
//   知らせます。行の要素やセルに直付けした印(値が変わったセルの光り・保存の印)を、前の行の印のまま新しい行に残さないために
//   使います。React 版では行の要素のキーは変わらないので呼ばれません。
//   展開行の中の入れ子のグリッドの行は知らせません(入れ子のグリッドの印はそのグリッドのコントローラが持つ)。
import { isInsideDetailCardOf } from '../logic/detailRow';

export const ROW_KEY_ATTRIBUTE = 'data-row-key';

export const observeRowRekeys = (container: HTMLElement, onRekey: (row: HTMLElement) => void): (() => void) => {
  if (typeof MutationObserver !== 'function') {
    return () => {};
  }
  const observer = new MutationObserver((records) => {
    // 1 回の知らせに同じ行が何度も来たら、最初の旧値と今の値で比べます(行き来して元のキーに戻っていれば知らせない)。
    const firstOldValue = new Map<HTMLElement, string | null>();
    for (const record of records) {
      const row = record.target;
      if (row instanceof HTMLElement && !firstOldValue.has(row)) {
        firstOldValue.set(row, record.oldValue);
      }
    }
    firstOldValue.forEach((oldValue, row) => {
      if (
        oldValue !== null &&
        oldValue !== row.getAttribute(ROW_KEY_ATTRIBUTE) &&
        row.classList.contains('ssg-body-row') &&
        !isInsideDetailCardOf(container, row)
      ) {
        onRekey(row);
      }
    });
  });
  observer.observe(container, {
    subtree: true,
    attributes: true,
    attributeFilter: [ROW_KEY_ATTRIBUTE],
    attributeOldValue: true,
  });
  return () => observer.disconnect();
};