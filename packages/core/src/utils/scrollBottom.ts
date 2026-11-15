// 追加(1.2.0 / 2026-11-09 実アプリの総点検 G-08 の続き): 縦のスクロールが末尾(下端)にあるかです(ハンドルの isAtBottom() と
//   onScroll の atBottom)。中身が見える高さより低い(スクロールしない)ときも末尾。拡大縮小で scrollTop が小数になり、末尾でも
//   1px 未満の差が残るため、1px 未満は末尾とみなします。
export const isScrolledToBottom = (el: HTMLElement): boolean => el.scrollHeight - el.scrollTop - el.clientHeight < 1;
