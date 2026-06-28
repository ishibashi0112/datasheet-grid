import type { ScrollAlign } from '../model/gridTypes';

// 追加(imperative API #1): スクロール先(論理座標)を算出する純ロジックです。
//   既存の useGridViewportSync(active cell 可視化)と同一の座標モデルを用います:
//   - content Y は y=0 がスクロールコンテンツ最上端。ヘッダー(sticky)が [0, headerHeight] を占め、
//     行は headerHeight からはじまります(行 i の上端 = headerHeight + rowTop(i))。
//   - 論理 scrollTop の可視帯(sticky ヘッダーに隠れない領域)は
//     [scrollTop + headerHeight, scrollTop + viewportHeight] です。
//   返り値は論理 scrollTop / scrollLeft で、呼び出し側が logicalToPhysicalScrollTop で物理へ戻します
//   (横は圧縮対象外のため物理 = 論理)。下限は常に 0、上限は maxScroll*(省略時は無制限)でクランプします。

export type VerticalScrollTargetParams = {
  // 行上端の content オフセット(= rowMetrics.rowTop(i)。ヘッダー高さは含めません)。
  rowTop: number;
  // 行の高さ(= rowMetrics.rowsHeight(i, i))です。
  rowHeight: number;
  headerHeight: number;
  viewportHeight: number;
  // 現在の論理 scrollTop(align='auto' の可視判定に使用)です。
  currentScrollTop: number;
  align: ScrollAlign;
  // 論理 scrollTop の上限(省略時は +∞ = 上限なし。下限は常に 0)です。
  maxScrollTop?: number;
};

export const computeVerticalScrollTarget = ({
  rowTop,
  rowHeight,
  headerHeight,
  viewportHeight,
  currentScrollTop,
  align,
  maxScrollTop,
}: VerticalScrollTargetParams): number => {
  const cellTop = headerHeight + rowTop;
  const cellBottom = cellTop + rowHeight;

  let target: number;
  if (align === 'start') {
    target = cellTop - headerHeight;
  } else if (align === 'end') {
    target = cellBottom - viewportHeight;
  } else if (align === 'center') {
    target = (cellTop + cellBottom) / 2 - (headerHeight + viewportHeight) / 2;
  } else {
    // 'auto': 既に可視ならそのまま。上にはみ出すなら start 整列、下なら end 整列(最小スクロール)。
    const visibleTop = currentScrollTop + headerHeight;
    const visibleBottom = currentScrollTop + viewportHeight;
    if (cellTop >= visibleTop && cellBottom <= visibleBottom) {
      target = currentScrollTop;
    } else if (cellTop < visibleTop) {
      target = cellTop - headerHeight;
    } else {
      target = cellBottom - viewportHeight;
    }
  }

  const upper = maxScrollTop ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(target, 0), Math.max(upper, 0));
};

export type HorizontalScrollTargetParams = {
  // 列左端の content オフセット(= leftPaneWidth + centerLeadingWidth + extent.start)です。
  cellLeft: number;
  cellWidth: number;
  leftPaneWidth: number;
  rightPaneWidth: number;
  viewportWidth: number;
  currentScrollLeft: number;
  align: ScrollAlign;
  maxScrollLeft?: number;
};

export const computeHorizontalScrollTarget = ({
  cellLeft,
  cellWidth,
  leftPaneWidth,
  rightPaneWidth,
  viewportWidth,
  currentScrollLeft,
  align,
  maxScrollLeft,
}: HorizontalScrollTargetParams): number => {
  const cellRight = cellLeft + cellWidth;
  // 可視帯(左右固定ペインに隠れない領域)の幅です。
  const visibleSpan = viewportWidth - leftPaneWidth - rightPaneWidth;

  let target: number;
  if (align === 'start') {
    target = cellLeft - leftPaneWidth;
  } else if (align === 'end') {
    target = cellRight - viewportWidth + rightPaneWidth;
  } else if (align === 'center') {
    target = (cellLeft + cellRight) / 2 - leftPaneWidth - visibleSpan / 2;
  } else {
    const visibleLeft = currentScrollLeft + leftPaneWidth;
    const visibleRight = currentScrollLeft + viewportWidth - rightPaneWidth;
    if (cellLeft >= visibleLeft && cellRight <= visibleRight) {
      target = currentScrollLeft;
    } else if (cellLeft < visibleLeft) {
      target = cellLeft - leftPaneWidth;
    } else {
      target = cellRight - viewportWidth + rightPaneWidth;
    }
  }

  const upper = maxScrollLeft ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(target, 0), Math.max(upper, 0));
};