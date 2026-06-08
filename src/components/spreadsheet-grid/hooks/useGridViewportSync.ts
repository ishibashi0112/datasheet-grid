import { useEffect, type RefObject } from 'react';
import type { ActiveCellOverlayRect } from '../ActiveCellOverlay';
import type { ColumnMeasurement } from '../logic/geometry';

type VirtualizerLike = {
  measure: () => void;
};

type UseGridViewportSyncArgs<T> = {
  // 中央スクロールペイン(従来の bodyScrollRef)です。横/縦スクロールのマスターです。
  bodyScrollRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: VirtualizerLike;
  columnVirtualizer: VirtualizerLike;
  rowHeight: number;
  filteredRowsLength: number;
  // columnVirtualizer の再計測トリガー用の依存です（中身は座標計算には使いません）。
  columnMeasurements: ColumnMeasurement<T>[];
  // 変更(10-E): 旧 totalColumnWidth → 中央ペインの列領域合計幅です。
  //             scroll clamp / 可視化はすべて中央ペインのローカル幅で行います。
  centerColumnsWidth: number;
  totalBodyHeight: number;
  // 変更(10-E): 旧 rowHeaderWidth → 中央ペインの先頭幅(leadingWidth)です。
  //             左固定列なし: rowHeaderWidth（従来と一致） / 左固定列あり: 0。
  leadingWidth: number;
  headerHeight: number;
  // 変更(10-E): active cell が中央ペインにあるときの「中央ペインローカル矩形」です。
  //             固定ペインにある場合は横スクロール不要なので null が渡されます。
  activeCellRect: ActiveCellOverlayRect | null;
};

// 追加: virtualizer 再計測、content shrink 時の scroll clamp、active cell 可視化をまとめます。
// 変更(10-E): すべての水平座標を「中央ペインローカル座標」に統一しました。
//             固定列が無い場合は leadingWidth===rowHeaderWidth /
//             centerColumnsWidth===totalColumnWidth となり、従来と完全に一致します。
export const useGridViewportSync = <T,>({
  bodyScrollRef,
  rowVirtualizer,
  columnVirtualizer,
  rowHeight,
  filteredRowsLength,
  columnMeasurements,
  centerColumnsWidth,
  totalBodyHeight,
  leadingWidth,
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
      leadingWidth + centerColumnsWidth - scrollElement.clientWidth,
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
    centerColumnsWidth,
    totalBodyHeight,
    leadingWidth,
    headerHeight,
  ]);

  // 追加: active cell が画面外へ出た場合に、scroll container を自動調整して常に表示領域内へ収めます。
  // 注記(10-E): activeCellRect は中央ペインローカル座標です。中央ペイン以外（固定列）に
  //             active cell がある場合は呼び出し側で null が渡るため、横スクロールは発生しません。
  useEffect(() => {
    if (!bodyScrollRef.current || !activeCellRect) {
      return;
    }

    const scrollElement = bodyScrollRef.current;
    const cellTop = headerHeight + activeCellRect.top;
    const cellBottom = cellTop + activeCellRect.height;
    const cellLeft = leadingWidth + activeCellRect.left;
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

    const visibleLeft = currentScrollLeft + leadingWidth;
    const visibleRight = currentScrollLeft + viewportWidth;
    if (cellLeft < visibleLeft) {
      nextScrollLeft = Math.max(cellLeft - leadingWidth, 0);
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
  }, [bodyScrollRef, activeCellRect, headerHeight, leadingWidth]);
};

export default useGridViewportSync;
