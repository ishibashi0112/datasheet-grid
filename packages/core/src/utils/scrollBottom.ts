// 追加(1.2.0 / 2026-11-09 実アプリの総点検 G-08 の続き): 縦のスクロールが末尾(下端)にあるかです(ハンドルの isAtBottom() と
//   onScroll の atBottom)。中身が見える高さより低い(スクロールしない)ときも末尾。拡大縮小で scrollTop が小数になり、末尾でも
//   1px 未満の差が残るうえ、Firefox は中身が 1,500 万 px 近い(100 万行の表。verticalGeometry の MAX_BODY_PX)と scrollHeight を
//   丸めて 1〜2px 大きく返し、scrollToBottom() の後も末尾の手前に見えるため、差が 2px 以下なら末尾とみなします
//   (1.2.0 の確かめで、Firefox の 100 万行の表で scrollToBottom() の後も false だった)。
const AT_BOTTOM_TOLERANCE_PX = 2;

export const isScrolledToBottom = (el: HTMLElement): boolean =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_TOLERANCE_PX;