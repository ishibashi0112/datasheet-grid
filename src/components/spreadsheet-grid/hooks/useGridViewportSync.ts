import { useEffect, type RefObject } from 'react';
import type { ActiveCellOverlayRect } from '../ActiveCellOverlay';
import type { ColumnMeasurement } from '../logic/geometry';

type VirtualizerLike = {
  measure: () => void;
};

type UseGridViewportSyncArgs<T> = {
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: VirtualizerLike;
  columnVirtualizer: VirtualizerLike;
  rowHeight: number;
  filteredRowsLength: number;
  columnMeasurements: ColumnMeasurement<T>[];
  totalColumnWidth: number;
  totalBodyHeight: number;
  rowHeaderWidth: number;
  headerHeight: number;
  activeCellRect: ActiveCellOverlayRect | null;
};

// 追加: virtualizer 再計測、content shrink 時の scroll clamp、active cell 可視化をまとめます。
export const useGridViewportSync = <T,>({
  bodyScrollRef,
  rowVirtualizer,
  columnVirtualizer,
  rowHeight,
  filteredRowsLength,
  columnMeasurements,
  totalColumnWidth,
  totalBodyHeight,
  rowHeaderWidth,
  headerHeight,
  activeCellRect,
}: UseGridViewportSyncArgs<T>) => {
  // 追加: 列/行サイズ変化時に virtualizer の measurement を再取得します。
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, rowHeight, filteredRowsLength]);

  // 追加: column geometry が変わった際に horizontal virtualizer を再計測します。
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer, columnMeasurements]);

  // 追加: content サイズが縮んだ場合に scroll を clamp します。
  useEffect(() => {
    if (!bodyScrollRef.current) {
      return;
    }

    const scrollElement = bodyScrollRef.current;
    const maxScrollLeft = Math.max(
      rowHeaderWidth + totalColumnWidth - scrollElement.clientWidth,
      0,
    );
    const maxScrollTop = Math.max(
      headerHeight + totalBodyHeight - scrollElement.clientHeight,
      0,
    );

    if (scrollElement.scrollLeft > maxScrollLeft) {
      scrollElement.scrollLeft = maxScrollLeft;
    }
    if (scrollElement.scrollTop > maxScrollTop) {
      scrollElement.scrollTop = maxScrollTop;
    }
  }, [
    bodyScrollRef,
    totalColumnWidth,
    totalBodyHeight,
    rowHeaderWidth,
    headerHeight,
  ]);

  // 追加: active cell が画面外へ出た場合に、scroll container を自動調整して常に表示領域内へ収めます。
  useEffect(() => {
    if (!bodyScrollRef.current || !activeCellRect) {
      return;
    }

    const scrollElement = bodyScrollRef.current;
    const cellTop = headerHeight + activeCellRect.top;
    const cellBottom = cellTop + activeCellRect.height;
    const cellLeft = rowHeaderWidth + activeCellRect.left;
    const cellRight = cellLeft + activeCellRect.width;

    const currentScrollTop = scrollElement.scrollTop;
    const currentScrollLeft = scrollElement.scrollLeft;
    const viewportHeight = scrollElement.clientHeight;
    const viewportWidth = scrollElement.clientWidth;

    let nextScrollTop = currentScrollTop;
    let nextScrollLeft = currentScrollLeft;

    const visibleTop = currentScrollTop + headerHeight;
    const visibleBottom = currentScrollTop + viewportHeight;
    if (cellTop < visibleTop) {
      nextScrollTop = Math.max(cellTop - headerHeight, 0);
    } else if (cellBottom > visibleBottom) {
      nextScrollTop = Math.max(cellBottom - viewportHeight, 0);
    }

    const visibleLeft = currentScrollLeft + rowHeaderWidth;
    const visibleRight = currentScrollLeft + viewportWidth;
    if (cellLeft < visibleLeft) {
      nextScrollLeft = Math.max(cellLeft - rowHeaderWidth, 0);
    } else if (cellRight > visibleRight) {
      nextScrollLeft = Math.max(cellRight - viewportWidth, 0);
    }

    if (
      nextScrollTop !== currentScrollTop ||
      nextScrollLeft !== currentScrollLeft
    ) {
      scrollElement.scrollTo({
        top: nextScrollTop,
        left: nextScrollLeft,
        behavior: 'auto',
      });
    }
  }, [bodyScrollRef, activeCellRect, headerHeight, rowHeaderWidth]);
};

export default useGridViewportSync;
