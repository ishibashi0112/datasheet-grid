// 追加(TT-1 / カスタムツールチップ): ツールチップの表示位置を計算する純ロジックです。
//   useGridTooltip(表示制御フック)が使います。
// 方針:
//   - 基本は「対象の上・水平中央」。左右はビューポートへ clamp します
//     (margin を残して [margin, viewportWidth - tipWidth - margin] に収める。
//     clamp が反転する極小画面では Math.max を後に適用して左端 margin を優先します)。
//   - 上に入らない(上端が margin を割る)場合だけ対象の下へフリップします。
//     下方向のはみ出しはそれ以上追わない仕様です(ツールチップは小型で、対象の直上/直下
//     以外に出すと紐付きが失われるため。パネルドラッグの clamp と同じ「シンプル優先」)。
export const TOOLTIP_GAP_PX = 7;
export const TOOLTIP_VIEWPORT_MARGIN_PX = 8;

export type TooltipPlacementArgs = {
  /* 対象要素の getBoundingClientRect 相当(fixed 配置のためビューポート座標) */
  targetRect: {
    top: number;
    left: number;
    width: number;
    bottom: number;
  };
  tipWidth: number;
  tipHeight: number;
  viewportWidth: number;
};

export type TooltipPlacement = {
  top: number;
  left: number;
  /* true = 上に入らず対象の下へフリップした */
  below: boolean;
};

export function computeTooltipPlacement(
  args: TooltipPlacementArgs,
): TooltipPlacement {
  const { targetRect, tipWidth, tipHeight, viewportWidth } = args;
  const centerX = targetRect.left + targetRect.width / 2;
  const left = Math.max(
    TOOLTIP_VIEWPORT_MARGIN_PX,
    Math.min(
      Math.round(centerX - tipWidth / 2),
      viewportWidth - tipWidth - TOOLTIP_VIEWPORT_MARGIN_PX,
    ),
  );
  const aboveTop = Math.round(targetRect.top - tipHeight - TOOLTIP_GAP_PX);
  if (aboveTop < TOOLTIP_VIEWPORT_MARGIN_PX) {
    return {
      top: Math.round(targetRect.bottom + TOOLTIP_GAP_PX),
      left,
      below: true,
    };
  }
  return { top: aboveTop, left, below: false };
}