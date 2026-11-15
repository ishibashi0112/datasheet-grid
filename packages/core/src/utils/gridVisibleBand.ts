// 追加(1.2.0 の見直し QH-3 / QH-6): グリッドのスクロールの枠の中で、セルの中身が見えている縦の範囲(画面の px)。
//   上に固定した見出しの行と上の固定行(pinnedTopRows)の下、下に固定した合計行と下の固定行(pinnedBottomRows)の上までです
//   (どれも本体の行の上に重なる)。変更(1.2.0 の確かめ直し C-N2): 固定したラベル行の帯(labelRow.sticky)の下からにします
//   (IME の変換中の入力受けが帯に重なり、帯の文字を隠していた)。枠が無い / 大きさの無い環境(jsdom)では null。
//   エラーの吹き出し(React の editors/editorVisibleBounds)と、IME の変換中の入力受け(controllers/imeInputController)が使います。
export const resolveGridVisibleBand = (element: Element): { top: number; bottom: number } | null => {
  const container = element.closest('.ssg-scroll-container');
  if (!container || container.clientHeight <= 0) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  let top = rect.top + container.clientTop;
  let bottom = top + container.clientHeight;
  for (const selector of ['.ssg-header-row', '.ssg-pinned-rows--top', '[data-ssg-sticky-label]']) {
    const band = container.querySelector(selector);
    if (band) {
      top = Math.max(top, band.getBoundingClientRect().bottom);
    }
  }
  for (const selector of ['.ssg-pinned-rows--bottom', '.ssg-total-row']) {
    const band = container.querySelector(selector);
    if (band) {
      bottom = Math.min(bottom, band.getBoundingClientRect().top);
    }
  }
  return { top, bottom };
};