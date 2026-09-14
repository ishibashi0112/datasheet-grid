// 追加(非依存化 ③-3): viewportSyncController のテストです(React 非依存で update を直接呼ぶ)。
//   hooks/useGridViewportSync.test.ts(hook 経由の座標変化ゲート回帰)と対になり、こちらは
//   「旧 effect の deps に相当する実行条件」を固定します。
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  clampScrollToContent,
  createViewportSyncController,
  type ViewportSyncArgs,
} from './viewportSyncController';

type ScrollToArgs = { top?: number; left?: number; behavior?: string };

const createScrollElement = () => {
  const scrollTo = vi.fn<(args: ScrollToArgs) => void>();
  const raw = { scrollLeft: 0, scrollTop: 0, clientWidth: 300, clientHeight: 200, scrollTo };
  return { element: raw as unknown as HTMLElement, raw, scrollTo };
};

const baseArgs = (scrollElement: HTMLElement | null): ViewportSyncArgs<unknown> => ({
  scrollElement,
  columnVirtualizer: { measure: vi.fn() },
  columnMeasurements: [],
  totalScrollWidth: 2000,
  physicalBodyHeight: 3600,
  headerHeight: 40,
  leftPaneWidth: 0,
  rightPaneWidth: 0,
  centerLeadingWidth: 50,
  activeCellRect: null,
  activeCell: null,
  verticalScaleFactor: 1,
});

describe('viewportSyncController', () => {
  it('列計測の参照が変わったときだけ virtualizer.measure() を呼ぶ', () => {
    const controller = createViewportSyncController();
    const args = baseArgs(null);
    controller.update(args);
    expect(args.columnVirtualizer.measure).toHaveBeenCalledTimes(1);
    // 同じ参照で再 update → 呼ばれない。
    controller.update({ ...args });
    expect(args.columnVirtualizer.measure).toHaveBeenCalledTimes(1);
    // 参照が変わる → 呼ばれる。
    controller.update({ ...args, columnMeasurements: [] });
    expect(args.columnVirtualizer.measure).toHaveBeenCalledTimes(2);
  });

  it('内容が縮んだら scrollLeft / scrollTop を上限へ clamp する(寸法が変わったときだけ)', () => {
    const scroll = createScrollElement();
    scroll.raw.scrollLeft = 1500;
    scroll.raw.scrollTop = 3000;
    const controller = createViewportSyncController();
    const args = baseArgs(scroll.element);
    controller.update(args);
    // 2000 - 300 = 1700 以内 / 40 + 3600 - 200 = 3440 以内なので不変。
    expect(scroll.raw.scrollLeft).toBe(1500);
    expect(scroll.raw.scrollTop).toBe(3000);
    // 幅・高さが縮む → clamp。
    controller.update({ ...args, totalScrollWidth: 1000, physicalBodyHeight: 1000 });
    expect(scroll.raw.scrollLeft).toBe(700);
    expect(scroll.raw.scrollTop).toBe(840);
    // 直接呼び出しも同じ結果。
    scroll.raw.scrollLeft = 900;
    clampScrollToContent(scroll.element, { totalScrollWidth: 1000, physicalBodyHeight: 1000, headerHeight: 40 });
    expect(scroll.raw.scrollLeft).toBe(700);
  });

  it('active cell は座標が変わったときだけ可視域へスクロールする(rect 参照だけの変化では動かない)', () => {
    const scroll = createScrollElement();
    scroll.raw.scrollLeft = 1000;
    const controller = createViewportSyncController();
    const cell = { row: 2, col: 1 };
    const rect = { left: 0, top: 72, width: 80, height: 36 };
    controller.update({ ...baseArgs(scroll.element), activeCell: cell, activeCellRect: rect });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 50, behavior: 'auto' }),
    );

    // 同座標・別参照の rect / cell → スクロールしない。
    controller.update({
      ...baseArgs(scroll.element),
      activeCell: { row: 2, col: 1 },
      activeCellRect: { ...rect },
    });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);

    // 座標が動く → スクロール。
    controller.update({
      ...baseArgs(scroll.element),
      activeCell: { row: 3, col: 1 },
      activeCellRect: { ...rect, top: 108 },
    });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(2);

    // 解除(null)→ 再設定で再度発火。
    controller.update({ ...baseArgs(scroll.element), activeCell: null, activeCellRect: null });
    controller.update({ ...baseArgs(scroll.element), activeCell: { row: 3, col: 1 }, activeCellRect: { ...rect, top: 108 } });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(3);
  });

  it('スクロール要素が未マウント(null)なら DOM 系の処理はスキップする', () => {
    const controller = createViewportSyncController();
    expect(() =>
      controller.update({
        ...baseArgs(null),
        activeCell: { row: 0, col: 1 },
        activeCellRect: { left: 0, top: 0, width: 80, height: 36 },
      }),
    ).not.toThrow();
  });
});