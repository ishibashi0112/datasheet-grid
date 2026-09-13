// 追加(非依存化 ③-3): ビューポート同期のコントローラです(React 非依存。旧 hooks/useGridViewportSync の
//   3 つの effect を移設)。update(args) をレンダー後に毎回呼ぶ前提で、各処理の実行条件(旧 effect の
//   deps に相当する引数の参照 / 値の変化)はコントローラ側で判定します(Object.is 比較 = React の deps
//   比較と同じ)。したがって「update を毎回呼ぶ」アダプタでも、旧実装と同じタイミングでだけ動きます。
//   1) 列計測(columnMeasurements)の参照が変わったら virtualizer を再測定する。
//   2) 内容が縮んだら scrollLeft / scrollTop を上限へ clamp する(内容縮小時のはみ出し防止)。
//   3) active cell の「座標」が変わったときだけ可視域へスクロールする(rect 参照だけの変化 = フィルター
//      確定等ではスクロールしない = scroll-jump 対策)。
import type { ColumnMeasurement } from '../logic/geometry';
import type { CellCoord } from '../model/gridTypes.core';
import {
  logicalToPhysicalScrollTop,
  physicalToLogicalScrollTop,
} from '../logic/verticalGeometry';

// active cell の矩形(ペイン列領域内ローカル座標。ActiveCellOverlayRect と同形)。
export type ViewportCellRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ViewportSyncArgs<T> = {
  // 共有スクロールコンテナ(未マウントなら null)。
  scrollElement: HTMLElement | null;
  columnVirtualizer: { measure: () => void };
  columnMeasurements: ColumnMeasurement<T>[];
  totalScrollWidth: number;
  // 物理ボディ高さ(pixel scaling 適用後)。
  physicalBodyHeight: number;
  headerHeight: number;
  leftPaneWidth: number;
  rightPaneWidth: number;
  centerLeadingWidth: number;
  activeCellRect: ViewportCellRect | null;
  activeCell: CellCoord | null;
  verticalScaleFactor: number;
};

export type ViewportSyncController<T> = {
  update: (args: ViewportSyncArgs<T>) => void;
};

// 内容縮小時の clamp(純粋な DOM 書き込み。テストからも直接呼べます)。
export const clampScrollToContent = (
  scrollElement: HTMLElement,
  args: Pick<
    ViewportSyncArgs<unknown>,
    'totalScrollWidth' | 'physicalBodyHeight' | 'headerHeight'
  >,
): void => {
  const maxScrollLeft = Math.max(
    args.totalScrollWidth - scrollElement.clientWidth,
    0,
  );
  const maxScrollTop = Math.max(
    args.headerHeight + args.physicalBodyHeight - scrollElement.clientHeight,
    0,
  );
  if (scrollElement.scrollLeft > maxScrollLeft) {
    scrollElement.scrollLeft = maxScrollLeft;
  }
  if (scrollElement.scrollTop > maxScrollTop) {
    scrollElement.scrollTop = maxScrollTop;
  }
};

// active cell を可視域へ入れるスクロール(必要なときだけ scrollTo)。
export const scrollCellIntoView = (
  scrollElement: HTMLElement,
  rect: ViewportCellRect,
  args: Pick<
    ViewportSyncArgs<unknown>,
    | 'headerHeight'
    | 'leftPaneWidth'
    | 'rightPaneWidth'
    | 'centerLeadingWidth'
    | 'verticalScaleFactor'
  >,
): void => {
  const cellTop = args.headerHeight + rect.top;
  const cellBottom = cellTop + rect.height;
  const cellLeft = args.leftPaneWidth + args.centerLeadingWidth + rect.left;
  const cellRight = cellLeft + rect.width;

  const currentScrollTop = physicalToLogicalScrollTop(
    scrollElement.scrollTop,
    args.verticalScaleFactor,
  );
  const currentScrollLeft = scrollElement.scrollLeft;
  const viewportHeight = scrollElement.clientHeight;
  const viewportWidth = scrollElement.clientWidth;

  let nextScrollTop = currentScrollTop;
  let nextScrollLeft = currentScrollLeft;

  const visibleTop = currentScrollTop + args.headerHeight;
  const visibleBottom = currentScrollTop + viewportHeight;
  if (cellTop < visibleTop) {
    nextScrollTop = Math.max(cellTop - args.headerHeight, 0);
  } else if (cellBottom > visibleBottom) {
    nextScrollTop = Math.max(cellBottom - viewportHeight, 0);
  }

  const visibleLeft = currentScrollLeft + args.leftPaneWidth;
  const visibleRight = currentScrollLeft + viewportWidth - args.rightPaneWidth;
  if (cellLeft < visibleLeft) {
    nextScrollLeft = Math.max(cellLeft - args.leftPaneWidth, 0);
  } else if (cellRight > visibleRight) {
    nextScrollLeft = Math.max(
      cellRight - viewportWidth + args.rightPaneWidth,
      0,
    );
  }

  if (
    nextScrollTop !== currentScrollTop ||
    nextScrollLeft !== currentScrollLeft
  ) {
    scrollElement.scrollTo({
      top: logicalToPhysicalScrollTop(nextScrollTop, args.verticalScaleFactor),
      left: nextScrollLeft,
      behavior: 'auto',
    });
  }
};

const changed = <A extends object>(
  prev: A | null,
  next: A,
  keys: ReadonlyArray<keyof A>,
): boolean => prev === null || keys.some((key) => !Object.is(prev[key], next[key]));

export const createViewportSyncController = <T,>(): ViewportSyncController<T> => {
  let prev: ViewportSyncArgs<T> | null = null;
  // 3) の座標変化ゲート用: 前回評価した active cell 座標。
  let lastEvaluatedCell: CellCoord | null = null;

  const update = (args: ViewportSyncArgs<T>) => {
    // 1) 列計測の再測定(旧 effect deps: columnVirtualizer, columnMeasurements)。
    if (changed(prev, args, ['columnVirtualizer', 'columnMeasurements'])) {
      args.columnVirtualizer.measure();
    }

    // 2) 内容縮小時の clamp(旧 effect deps: scrollRef, totalScrollWidth, physicalBodyHeight, headerHeight)。
    if (
      changed(prev, args, [
        'scrollElement',
        'totalScrollWidth',
        'physicalBodyHeight',
        'headerHeight',
      ]) &&
      args.scrollElement
    ) {
      clampScrollToContent(args.scrollElement, args);
    }

    // 3) active cell 可視化(旧 effect deps: scrollRef, activeCellRect, activeCell, headerHeight,
    //    leftPaneWidth, rightPaneWidth, centerLeadingWidth, verticalScaleFactor)。
    if (
      changed(prev, args, [
        'scrollElement',
        'activeCellRect',
        'activeCell',
        'headerHeight',
        'leftPaneWidth',
        'rightPaneWidth',
        'centerLeadingWidth',
        'verticalScaleFactor',
      ])
    ) {
      const prevCell = lastEvaluatedCell;
      const { activeCell } = args;
      const coordUnchanged =
        prevCell !== null &&
        activeCell !== null &&
        prevCell.row === activeCell.row &&
        prevCell.col === activeCell.col;
      lastEvaluatedCell = activeCell;
      if (!coordUnchanged && args.scrollElement && args.activeCellRect) {
        scrollCellIntoView(args.scrollElement, args.activeCellRect, args);
      }
    }

    prev = args;
  };

  return { update };
};