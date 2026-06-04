import type { CSSProperties } from 'react';

// 追加: 選択範囲の矩形情報です。
export type SelectionOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionOverlayProps = {
  rect: SelectionOverlayRect | null;
  headerHeight: number;
  rowHeaderWidth: number;
};

// 追加: 選択範囲をセル本体とは独立したレイヤーで描画するコンポーネントです。
export function SelectionOverlay({
  rect,
  headerHeight,
  rowHeaderWidth,
}: SelectionOverlayProps) {
  if (!rect) {
    return null;
  }

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: rowHeaderWidth + rect.left,
    top: headerHeight + rect.top,
    width: rect.width,
    height: rect.height,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    border: '2px solid #2563eb',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    zIndex: 2,
  };

  return <div style={overlayStyle} />;
}

export default SelectionOverlay;
``