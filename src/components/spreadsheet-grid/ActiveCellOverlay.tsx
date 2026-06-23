import type { CSSProperties } from 'react';

// 追加: active cell の矩形情報です。
// 変更(10-D): left は「ペイン列領域内ローカル座標」になりました（leadingWidth 非含有）。
export type ActiveCellOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ActiveCellOverlayProps = {
  rect: ActiveCellOverlayRect | null;
  headerHeight: number;
  // 変更(10-D): rowHeaderWidth → leadingWidth に一般化しました。
  //             固定列なしの中央ペインでは leadingWidth === rowHeaderWidth となり従来と同一です。
  leadingWidth: number;
  // 追加(scroll-space 仮想化 修正): 絶対論理 top から差し引く描画ウィンドウ基準オフセット(px)。
  //   no-op では 0(従来と同一配置)。scaling 時のみ正値で、巨大 transform を避けるため
  //   rect.top(絶対論理)をウィンドウ相対へ寄せます。基準ぶんは wrapper の translateY に
  //   同額含まれるため、画面上の表示位置は不変です。
  baseOffset?: number;
};

// 追加: active cell を独立レイヤーで描画するコンポーネントです。
// 変更(10-D): ペイン別座標系に対応。active cell が属するペインの relative コンテナ内へ配置されます。
export function ActiveCellOverlay({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset = 0,
}: ActiveCellOverlayProps) {
  if (!rect) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + rect.left,
    top: headerHeight + rect.top - baseOffset,
    width: rect.width,
    height: rect.height,
    border: '2px solid #3461c9',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    zIndex: 4,
  };

  return <div style={overlayStyle} />;
}

export default ActiveCellOverlay;