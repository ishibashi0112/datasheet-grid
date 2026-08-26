// 追加(FIT-1): 列フィルター popover の配置計算(純関数)です。
//   従来は useFilterPopoverController 内の即値計算で、見積もり高さ定数でフリップ判定する
//   だけだったため、実高が見積もりを超える内容(dateSet の条件 + プリセット + ツリーなど)や
//   小さい viewport で下端が画面外へはみ出し、マウスで届かない事故がありました。
//   本関数は「実測(取れるまでは見積もり)高さ」を受け、必ず viewport 内へ収めます。
//   - maxHeight = viewport 高 - margin×2。popover 側は flex 化されており、上限に達すると
//     候補リストが縮んで内部スクロールになります。
//   - 配置は 下 → 上フリップ → 下端収め → 上端 margin の順でクランプします。
//     高さ ≤ maxHeight のため、この順で必ず全体が画面内に入ります。

export type FilterPopoverPlacementInput = {
  // anchor(列ヘッダーセル)の viewport 座標です(getBoundingClientRect 由来)。
  anchorTop: number;
  anchorBottom: number;
  anchorRight: number;
  // viewport 寸法(window.innerWidth / innerHeight)です。
  viewportWidth: number;
  viewportHeight: number;
  // popover の幅(固定)と高さ(実測 or 見積もり)です。
  popupWidth: number;
  popupHeight: number;
  // anchor との縦オフセットと viewport 端の余白です。
  offsetY: number;
  viewportMargin: number;
};

export type FilterPopoverPlacement = {
  top: number;
  left: number;
  maxHeight: number;
};

export const computeFilterPopoverPlacement = ({
  anchorTop,
  anchorBottom,
  anchorRight,
  viewportWidth,
  viewportHeight,
  popupWidth,
  popupHeight,
  offsetY,
  viewportMargin,
}: FilterPopoverPlacementInput): FilterPopoverPlacement => {
  const maxHeight = Math.max(0, viewportHeight - viewportMargin * 2);
  const effectiveHeight = Math.min(popupHeight, maxHeight);

  // 横: anchor 右端へ右揃え → 左右の margin でクランプします。
  let left = anchorRight - popupWidth;
  left = Math.max(viewportMargin, left);
  left = Math.min(left, viewportWidth - popupWidth - viewportMargin);

  // 縦: 下配置 → 収まらなければ上フリップ → 下端収め → 上端 margin。
  let top = anchorBottom + offsetY;
  if (top + effectiveHeight > viewportHeight - viewportMargin) {
    top = anchorTop - effectiveHeight - offsetY;
  }
  top = Math.min(top, viewportHeight - viewportMargin - effectiveHeight);
  top = Math.max(viewportMargin, top);

  return { top, left, maxHeight };
};
