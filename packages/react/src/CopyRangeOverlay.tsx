// 追加(motion-4 / M-3): コピー範囲(Ctrl/Cmd+C したあとの「動く点線」)を描くオーバーレイです。SelectionOverlay と
//   同じ座標系(ペインローカル + leadingWidth / headerHeight / baseOffset)で、静的スタイル(点線 / アニメ)は
//   styles.css(.ssg-copy-range-overlay)。
import type { CSSProperties } from 'react';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import type { GridResolvedSlot } from './model/gridTypes';
import type { SelectionOverlayRect } from './SelectionOverlay';

type CopyRangeOverlayProps = {
  rect: SelectionOverlayRect | null;
  headerHeight: number;
  leadingWidth: number;
  baseOffset?: number;
  slot?: GridResolvedSlot;
};

export function CopyRangeOverlay({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset = 0,
  slot,
}: CopyRangeOverlayProps) {
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
  return (
    <div
      className={cx('ssg-copy-range-overlay', slot?.className)}
      style={{ ...slot?.style, ...overlayStyle }}
      data-ssg-copy-range=""
    />
  );
}

export default CopyRangeOverlay;
