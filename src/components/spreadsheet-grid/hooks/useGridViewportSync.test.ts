// 追加(scroll-jump 対策)の回帰テスト: active cell 可視化スクロールの「座標変化ゲート」です。
//   フィルター確定・ソート・行増減などのレイアウト再計算では activeCellRect の「参照」だけが
//   変わり座標は同一のまま effect が再発火するため、修正前は画面外に残っていたアクティブセルへ
//   スクロールが引き戻されていました(報告: フィルター確定で横スクロールが左端へジャンプ)。
//   本テストは renderHook 直叩きで「座標不変なら rect 参照/値が変わってもスクロールしない /
//   座標が動いたときは従来どおり可視化する」を検証します(jsdom では列仮想化が 0 列描画のため
//   グリッド render 経由では検証できません。useGridPointerInteractions.test.ts と同方針)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

import { useGridViewportSync } from './useGridViewportSync';
import type { ActiveCellOverlayRect } from '../ActiveCellOverlay';
import type { CellCoord } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

// 幾何設定: viewport 300x200 / ヘッダー 40 / 固定ペインなし / 中央先頭幅(行ヘッダー) 50。
//   セル幅 80・行高 36 とし、col=1 のセルは中央ローカル left=0(コンテンツ絶対 left=50)に置きます。
//   scrollLeft=0 なら可視域 [0, 300] 内、scrollLeft=1000 なら画面外左です。
const HEADER_HEIGHT = 40;
const CENTER_LEADING_WIDTH = 50;
const CELL_WIDTH = 80;
const ROW_HEIGHT = 36;

type ScrollToArgs = { top?: number; left?: number; behavior?: string };

// scrollTo をスパイする最小のスクロール要素スタブです(clamp effect は直代入のため干渉しません)。
const createScrollElement = () => {
  const scrollTo = vi.fn<(args: ScrollToArgs) => void>();
  const element = {
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 300,
    clientHeight: 200,
    scrollTo,
  };
  return {
    element: element as unknown as HTMLDivElement,
    raw: element,
    scrollTo,
  };
};

const rectForCell = (cell: CellCoord): ActiveCellOverlayRect => ({
  left: (cell.col - 1) * CELL_WIDTH,
  top: cell.row * ROW_HEIGHT,
  width: CELL_WIDTH,
  height: ROW_HEIGHT,
});

type HookProps = {
  activeCell: CellCoord | null;
  activeCellRect: ActiveCellOverlayRect | null;
};

const setup = (initial: HookProps) => {
  const scroll = createScrollElement();
  const scrollRef = { current: scroll.element };
  const columnVirtualizer = { measure: vi.fn() };
  const view = renderHook(
    ({ activeCell, activeCellRect }: HookProps) =>
      useGridViewportSync({
        scrollRef,
        columnVirtualizer,
        columnMeasurements: [],
        totalScrollWidth: 2000,
        physicalBodyHeight: 3600,
        headerHeight: HEADER_HEIGHT,
        leftPaneWidth: 0,
        rightPaneWidth: 0,
        centerLeadingWidth: CENTER_LEADING_WIDTH,
        activeCellRect,
        activeCell,
        verticalScaleFactor: 1,
      }),
    { initialProps: initial },
  );
  return { ...view, scroll };
};

describe('useGridViewportSync active cell 可視化(座標変化ゲート)', () => {
  it('座標不変のまま rect 参照だけが変わっても(フィルター確定相当)スクロールしない', () => {
    const cell: CellCoord = { row: 0, col: 1 };
    const { rerender, scroll } = setup({
      activeCell: cell,
      activeCellRect: rectForCell(cell),
    });
    // マウント時点では可視域内なのでスクロールなし。
    expect(scroll.scrollTo).not.toHaveBeenCalled();

    // ユーザーが右へスクロールしてアクティブセルが画面外左になった状態で、
    // フィルター確定相当(rowMetrics 再計算 → 同値の新規 rect オブジェクト)を再レンダー。
    scroll.raw.scrollLeft = 1000;
    rerender({ activeCell: cell, activeCellRect: rectForCell(cell) });
    expect(scroll.scrollTo).not.toHaveBeenCalled();

    // 行数変化で同一 view 座標のまま rect の「値」が変わるケース(top 移動)も追わない。
    rerender({
      activeCell: cell,
      activeCellRect: { ...rectForCell(cell), top: 360 },
    });
    expect(scroll.scrollTo).not.toHaveBeenCalled();
  });

  it('座標が実際に動いたときは従来どおり可視域へスクロールする', () => {
    const cellA: CellCoord = { row: 0, col: 1 };
    const { rerender, scroll } = setup({
      activeCell: cellA,
      activeCellRect: rectForCell(cellA),
    });
    expect(scroll.scrollTo).not.toHaveBeenCalled();

    // 画面外左(scrollLeft=1000)でキーボード移動相当の座標変化 → セル左端へ戻る。
    //   期待 left = cellLeft(=leadingWidth + ローカル left) - leftPaneWidth(0) = 130。
    scroll.raw.scrollLeft = 1000;
    const cellB: CellCoord = { row: 0, col: 2 };
    rerender({ activeCell: cellB, activeCellRect: rectForCell(cellB) });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      left: CENTER_LEADING_WIDTH + CELL_WIDTH,
      behavior: 'auto',
    });

    // 直後にレイアウト再計算相当(同座標・新規 rect 参照)が来ても再スクロールしない。
    rerender({ activeCell: cellB, activeCellRect: rectForCell(cellB) });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('activeCell 解除(null)後に再設定されたら可視化が発火する', () => {
    const cell: CellCoord = { row: 0, col: 1 };
    const { rerender, scroll } = setup({
      activeCell: null,
      activeCellRect: null,
    });
    expect(scroll.scrollTo).not.toHaveBeenCalled();

    // 画面外の位置でアクティブセルが設定される(命令的 setActiveCell 相当)→ 可視化する。
    scroll.raw.scrollLeft = 1000;
    rerender({ activeCell: cell, activeCellRect: rectForCell(cell) });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      left: CENTER_LEADING_WIDTH,
      behavior: 'auto',
    });
  });
});