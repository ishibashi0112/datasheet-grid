// 追加(motion-5 / M-6): クロスヘア(hoverHighlight='cross')のポインタ列の帯です。SelectionOverlay と同じ座標系
//   (ペインローカル + leadingWidth / headerHeight / baseOffset)で、描画窓の縦範囲だけを覆います(仮想化の外は
//   描かない)。静的スタイルは styles.css(.ssg-col-hover-overlay)。
import type { CSSProperties } from 'react';
import type { SelectionOverlayRect } from './SelectionOverlay';

type ColumnHoverOverlayProps = {
  rect: SelectionOverlayRect | null;
  headerHeight: number;
  leadingWidth: number;
  baseOffset?: number;
};

export function ColumnHoverOverlay({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset = 0,
}: ColumnHoverOverlayProps) {
  if (!rect) {
    return null;
  }
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + rect.left,
    top: headerHeight + rect.top - baseOffset,
    width: rect.width,
    height: rect.height,
  };
  return <div className="ssg-col-hover-overlay" style={overlayStyle} data-ssg-col-hover="" />;
}

export default ColumnHoverOverlay;
