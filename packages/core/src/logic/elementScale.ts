// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-29): 祖先の transform: scale() で縮んだ / 広がった倍率を、要素の見た目の大きさ
//   (getBoundingClientRect)とレイアウトの大きさ(offsetWidth / offsetHeight)の比から求めます。ポインタの位置(画面の px)から
//   セルや列幅を求めるときに、画面の px をレイアウトの px へ戻すのに使います(倍率 0.8 の箱の中で、ドラッグの範囲選択・
//   フィルハンドル・列幅のドラッグがポインタとずれていた)。
//   小数の幅の丸め(offsetWidth は整数)で 1 からずれないよう、差が 1px 未満なら 1 とします。どちらかが 0(隠れている /
//   寸法を返さない環境)のときも 1 です。
export type ElementScale = { x: number; y: number };

const IDENTITY_SCALE: ElementScale = { x: 1, y: 1 };

const ratio = (visual: number, layout: number): number =>
  layout <= 0 || visual <= 0 || Math.abs(visual - layout) < 1 ? 1 : visual / layout;

export const resolveElementScale = (
  element: HTMLElement | null,
  rect: { width: number; height: number } | null = null,
): ElementScale => {
  if (element === null) {
    return IDENTITY_SCALE;
  }
  const box = rect ?? element.getBoundingClientRect();
  const x = ratio(box.width, element.offsetWidth);
  const y = ratio(box.height, element.offsetHeight);
  return x === 1 && y === 1 ? IDENTITY_SCALE : { x, y };
};
