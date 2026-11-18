// 追加(Solid 版 段階 1-2): 入力の検査の NG のときにエディタの下へ出すエラーの吹き出しの置き方(React 版の
//   editors/CellEditorErrorBubble.tsx から移しました。DOM だけを見るので Solid 版と共用)。
//   既定はセルの下。見えている範囲(合計行の上・枠の中・ウィンドウの中)の下端にかかるときは上へ(上のほうがはみ出すときは
//   下のまま)、右へはみ出すときは左へずらし(左端は越えない)、見えている範囲より幅の広い文言はその幅で折り返します
//   (1.0.2 / B-05 と、その確かめ直し・レビュー QA-3)。
import { resolveEditorVisibleY, resolveShiftIntoView, resolveVisibleWidth } from './editorVisibleBounds';

export const ERROR_BUBBLE_ABOVE_CLASS = 'ssg-cell-editor-error--above';

export type ErrorBubblePlacement = {
  above: boolean;
  shift: number;
  wrapWidth: number | null;
};

export const DEFAULT_ERROR_BUBBLE_PLACEMENT: ErrorBubblePlacement = { above: false, shift: 0, wrapWidth: null };

// 下に出した位置で測り、見えている範囲の下端にかかるなら上へ(上のほうがはみ出すときは下のまま)。
const EDGE_MARGIN = 4;
const shouldPlaceAbove = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const bounds = resolveEditorVisibleY(element);
  const overflowBelow = rect.bottom - (bounds.bottom - EDGE_MARGIN);
  if (overflowBelow <= 0) {
    return false;
  }
  // 上へ出すと、エディタの枠(.ssg-cell-editor)の上端から 4px 上に下端が来ます。
  const anchorTop = element.parentElement?.getBoundingClientRect().top ?? rect.top;
  const overflowAbove = bounds.top + EDGE_MARGIN - (anchorTop - 4 - rect.height);
  return overflowAbove < overflowBelow;
};

// 折り返すときは幅を決めて書きます(max-width だけだと、絶対配置の吹き出しはエディタの枠 = セルの幅で折り返す)。
const applyWrap = (element: HTMLElement, wrapWidth: number | null) => {
  element.style.width = wrapWidth !== null ? `${wrapWidth}px` : '';
  element.style.whiteSpace = wrapWidth !== null ? 'normal' : '';
};

// 吹き出しの要素を測って置き方を決め、その場で要素に付けます(描いた直後に 1 回。文言が変わったら作り直して測り直す)。
//   今の配置(上に出す印・ずらし・折り返し)を外してから、下に出した位置で測ります(上に出した位置で測ると「下に収まる」と
//   判定して下へ戻っていた。レビュー QA-3)。返した置き方は、フレームワークが描くときの class / style にも使います
//   (描き直しで付けた値が消えないように)。
export const placeErrorBubble = (element: HTMLElement): ErrorBubblePlacement => {
  element.classList.remove(ERROR_BUBBLE_ABOVE_CLASS);
  element.style.left = '';
  element.style.width = '';
  element.style.whiteSpace = '';
  // 見えている範囲より広ければ、その幅で折り返してから上下とずらしを測ります(折り返すと背が高くなる)。
  const visibleWidth = resolveVisibleWidth(element);
  const wrapWidth = visibleWidth !== null && element.getBoundingClientRect().width > visibleWidth ? visibleWidth : null;
  applyWrap(element, wrapWidth);
  const placement: ErrorBubblePlacement = {
    above: shouldPlaceAbove(element),
    shift: resolveShiftIntoView(element),
    wrapWidth,
  };
  element.classList.toggle(ERROR_BUBBLE_ABOVE_CLASS, placement.above);
  element.style.left = placement.shift > 0 ? `${-placement.shift}px` : '';
  return placement;
};