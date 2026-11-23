// 追加(1.5.0 / 速さの案 B): 別の行に使い回した行の要素(primitives/rowSlots)へ、次の次のフレームまで属性を付けます。
//   styles.css がこの属性の付いた行とその中の transition を止めます(行の位置の transform・データバーの幅・カラースケールの
//   背景色・利用側がセルに付けた transition などが、前の行の値から新しい行の値へ動いて見えないように。React 版は新しい
//   要素なので動かない)。スクロール中は ssg-scroll-container--scrolling でも止まりますが、スクロール以外で描く範囲が
//   変わったときのためにも付けます。
//   外すのは 2 つ先の requestAnimationFrame(1 つ目は同じフレームの描画の前に呼ばれるので、そこで外すと transition が始まる)。

export const REUSED_ROW_ATTRIBUTE = 'data-ssg-reused';

const marked = new Set<HTMLElement>();
let frame: number | null = null;

const release = () => {
  frame = null;
  for (const element of marked) {
    element.removeAttribute(REUSED_ROW_ATTRIBUTE);
  }
  marked.clear();
};

export const markReusedRow = (element: HTMLElement): void => {
  element.setAttribute(REUSED_ROW_ATTRIBUTE, '');
  marked.add(element);
  if (frame !== null || typeof requestAnimationFrame !== 'function') {
    return;
  }
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(release);
  });
};