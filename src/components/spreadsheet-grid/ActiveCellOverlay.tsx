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
};

// 追加: active cell を独立レイヤーで描画するコンポーネントです。
// 変更(10-D): ペイン別座標系に対応。active cell が属するペインの relative コンテナ内へ配置されます。
export function ActiveCellOverlay({
  rect,
  headerHeight,
  leadingWidth,
}: ActiveCellOverlayProps) {
  if (!rect) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + rect.left,
    top: headerHeight + rect.top,
    width: rect.width,
    height: rect.height,
    border: '2px solid #2563eb',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    zIndex: 4,
  };

  return <div style={overlayStyle} />;
}

export default ActiveCellOverlay;
