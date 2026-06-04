import type { CSSProperties } from 'react';

// 追加: active cell の矩形情報です。
export type ActiveCellOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ActiveCellOverlayProps = {
  rect: ActiveCellOverlayRect | null;
  headerHeight: number;
  rowHeaderWidth: number;
};

// 追加: active cell を独立レイヤーで描画するコンポーネントです。
export function ActiveCellOverlay({
  rect,
  headerHeight,
  rowHeaderWidth,
}: ActiveCellOverlayProps) {
  if (!rect) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: rowHeaderWidth + rect.left,
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