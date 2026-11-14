// 追加(非依存化 ③-3): viewportSyncController のテストです(React 非依存で update を直接呼ぶ)。
//   hooks/useGridViewportSync.test.ts(hook 経由の座標変化ゲート回帰)と対になり、こちらは
//   「旧 effect の deps に相当する実行条件」を固定します。
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  clampScrollToContent,
  createScrollScaleAnchor,
  createViewportSyncController,
  revealActiveCellInPage,
  scrollCellIntoView,
  type ViewportSyncArgs,
} from './viewportSyncController';

type ScrollToArgs = { top?: number; left?: number; behavior?: string };

const createScrollElement = () => {
  const scrollTo = vi.fn<(args: ScrollToArgs) => void>();
  // closest / ownerDocument: アクティブセルをページでも見せる処理(J-10)が読む(グリッドの外なので何もしない)。
  const raw = {
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 300,
    clientHeight: 200,
    scrollTo,
    ownerDocument: document,
    closest: () => null,
  };
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

  // 追加(合計行 3A): 合計行の高さはスクロール可能な高さに足し、行を見せるときはその裏に隠さない。
  it('footerHeight: clamp の上限に足し、変化でも clamp し、可視化では合計行の上へ出す', () => {
    const scroll = createScrollElement();
    scroll.raw.scrollTop = 3470;
    const controller = createViewportSyncController();
    // 40 + 3600 + 36 - 200 = 3476 以内なので不変(合計行なしなら 3440 へ clamp される位置)。
    controller.update({ ...baseArgs(scroll.element), footerHeight: 36 });
    expect(scroll.raw.scrollTop).toBe(3470);
    // 合計行を外す → 上限が縮むので clamp。
    controller.update({ ...baseArgs(scroll.element), footerHeight: 0 });
    expect(scroll.raw.scrollTop).toBe(3440);

    // 可視化: 下端 = scrollTop + (200 - 36)。行の下端 40 + 300 = 340 > 164 → 340 - 164 = 176 へ。
    const visible = createScrollElement();
    const rect = { left: 0, top: 264, width: 80, height: 36 };
    createViewportSyncController().update({
      ...baseArgs(visible.element),
      activeCell: { row: 7, col: 0 },
      activeCellRect: rect,
      footerHeight: 36,
    });
    expect(visible.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 176 }));
    // 合計行なし(従来)は 340 - 200 = 140。
    const plain = createScrollElement();
    createViewportSyncController().update({
      ...baseArgs(plain.element),
      activeCell: { row: 7, col: 0 },
      activeCellRect: rect,
    });
    expect(plain.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 140 }));
  });

  // 追加(BR-5): 縮尺のあるとき、下端に合わせるときだけ物理位置を切り上げる(上端に合わせるときはそのまま)。
  it('縮尺のあるとき、下へ動かして下端に合わせるときだけ物理位置を切り上げる', () => {
    const rect = { left: 0, top: 264, width: 80, height: 36 };
    // 下端合わせ: 40 + 300 - 200 = 140(論理)→ 140 / 2.4 = 58.33 → 59。
    const down = createScrollElement();
    createViewportSyncController().update({
      ...baseArgs(down.element),
      verticalScaleFactor: 2.4,
      activeCell: { row: 7, col: 0 },
      activeCellRect: rect,
    });
    expect(down.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 59 }));
    // 上端合わせ: 物理 500(論理 1200)から行の top 100 へ → 100 / 2.4 = 41.67(切り上げない)。
    const up = createScrollElement();
    up.raw.scrollTop = 500;
    createViewportSyncController().update({
      ...baseArgs(up.element),
      verticalScaleFactor: 2.4,
      activeCell: { row: 2, col: 0 },
      activeCellRect: { ...rect, top: 100 },
    });
    expect(up.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 100 / 2.4 }));
  });
});

// 追加(段階 2 の確かめ直し N4-1 / N5-1): 行を見せる縦の位置。clientHeight 200 / headerHeight 40 = 見える本体 160px。
describe('scrollCellIntoView の縦の位置', () => {
  const geometry = {
    headerHeight: 40,
    leftPaneWidth: 0,
    rightPaneWidth: 0,
    centerLeadingWidth: 50,
    verticalScaleFactor: 1,
  };
  const run = (scrollTop: number, rect: { top: number; height: number }, extra: object = {}) => {
    const { element, raw, scrollTo } = createScrollElement();
    raw.scrollTop = scrollTop;
    scrollCellIntoView(element, { ...rect, left: 0, width: 100 }, { ...geometry, ...extra });
    return scrollTo.mock.calls.at(-1)?.[0]?.top;
  };

  it('下にはみ出す行は下端に合わせる(見える高さに収まる行)', () => {
    expect(run(0, { top: 300, height: 36 })).toBe(176);
  });

  it('見える高さより背の高い行は、下へ動くときも上端に合わせる(N5-1)', () => {
    expect(run(0, { top: 300, height: 400 })).toBe(300);
    // 上端に合わせ済みなら動かさない。
    expect(run(300, { top: 300, height: 400 })).toBeUndefined();
  });

  it('ラベル行の固定の帯に隠れている行は、帯の下へ合わせる(N4-1)', () => {
    const stickyTopInset = { visibleAt: () => 30, coveringRowAt: () => 30 };
    // 行の上端 310 は見出しの直下(300)より下だが、帯(300〜330)の裏。
    expect(run(300, { top: 310, height: 30 }, { stickyTopInset })).toBe(280);
    // 帯より下なら動かさない。
    expect(run(300, { top: 330, height: 30 }, { stickyTopInset })).toBeUndefined();
  });
});

// 追加(1.0.2 / 2026-11-09 実アプリの総点検 J-10): キーボードで動かしたアクティブセルがウィンドウの外へ出たら、ページも最小限動かす。
describe('revealActiveCellInPage(J-10)', () => {
  const geometry = { headerHeight: 40, verticalScaleFactor: 1 };
  const rect = { top: 100, height: 36, left: 0, width: 100 };
  const rectAt = (top: number, height: number) =>
    () => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  const setup = () => {
    const shell = document.createElement('div');
    shell.className = 'ssg-shell';
    shell.tabIndex = 0;
    const container = document.createElement('div');
    shell.appendChild(container);
    document.body.appendChild(shell);
    // スクロールの枠は画面の 300〜500。行の上端 100 は 見出し 40 の下 = 画面の 440〜476。
    container.getBoundingClientRect = rectAt(300, 200);
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const restore = () => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
      scrollBy.mockRestore();
      shell.remove();
    };
    return { shell, container, scrollBy, restore };
  };

  it('グリッドがフォーカスを持ち、最後の操作がキーボードのとき、見えるだけページを動かす', () => {
    const { shell, container, scrollBy, restore } = setup();
    shell.focus();
    revealActiveCellInPage(container, rect, geometry);
    expect(scrollBy).toHaveBeenCalledWith({ top: 76, behavior: 'auto' });
    restore();
  });

  it('マウス / タッチで触った後・フォーカスが外にあるとき・見えているときは動かさない', () => {
    const { shell, container, scrollBy, restore } = setup();
    shell.focus();
    shell.setAttribute('data-ssg-pointer', '');
    revealActiveCellInPage(container, rect, geometry);
    shell.removeAttribute('data-ssg-pointer');
    shell.blur();
    revealActiveCellInPage(container, rect, geometry);
    shell.focus();
    revealActiveCellInPage(container, { ...rect, top: 0 }, geometry);
    expect(scrollBy).not.toHaveBeenCalled();
    restore();
  });

  it('スクロールする親があれば先に親を動かし、残りをページで動かす', () => {
    const { shell, container, scrollBy, restore } = setup();
    const parent = document.createElement('div');
    parent.style.overflowY = 'auto';
    // 親の見える範囲は画面の 0〜380(ウィンドウの中)、スクロールできるのは 30 まで。
    parent.getBoundingClientRect = rectAt(0, 380);
    Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 380 });
    Object.defineProperty(parent, 'scrollHeight', { configurable: true, value: 410 });
    let parentScrollTop = 0;
    Object.defineProperty(parent, 'scrollTop', {
      configurable: true,
      get: () => parentScrollTop,
      set: (value: number) => {
        parentScrollTop = value;
      },
    });
    document.body.appendChild(parent);
    parent.appendChild(shell);
    shell.focus();
    // 行の上端 10 = 画面の 350〜386。下端を親の 380 に入れるには 6。親だけ動かし、ページは動かさない。
    revealActiveCellInPage(container, { ...rect, top: 10 }, geometry);
    expect(parent.scrollTop).toBe(6);
    expect(scrollBy).not.toHaveBeenCalled();
    // 親が動ききらない(上限 30)ときは、残りをページで(画面の 440〜476 → 親で 30 → 410〜446 → ページで 46)。
    parent.scrollTop = 0;
    revealActiveCellInPage(container, rect, geometry);
    expect(parent.scrollTop).toBe(30);
    expect(scrollBy).toHaveBeenCalledWith({ top: 46, behavior: 'auto' });
    parent.remove();
    restore();
  });
});

// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-24): 縮めたスクロールで率が変わったら見ている行(論理の位置)を保つ。
describe('createScrollScaleAnchor(AP-24)', () => {
  it('率が変わったら 物理 = 前の物理 × 前の率 ÷ 今の率 へ直して知らせる。率が同じ / 要素が変わったときは何もしない', () => {
    const { element, raw } = createScrollElement();
    const anchor = createScrollScaleAnchor();
    const onAnchored = vi.fn();
    raw.scrollTop = 10_000_000;
    anchor.update(element, 2.4, onAnchored);
    expect(onAnchored).not.toHaveBeenCalled();
    // 行を足して率が 2.4 → 2.5(論理の位置 24,000,000 を保つ = 物理 9,600,000)。
    anchor.update(element, 2.5, onAnchored);
    expect(raw.scrollTop).toBe(9_600_000);
    expect(onAnchored).toHaveBeenCalledWith(9_600_000);
    // 同じ率では何もしない。
    anchor.update(element, 2.5, onAnchored);
    expect(onAnchored).toHaveBeenCalledTimes(1);
    // 縮めない表へ戻る(率 1)ときも論理の位置を保つ。
    anchor.update(element, 1, onAnchored);
    expect(raw.scrollTop).toBe(24_000_000);
    // 要素が変わったときは前の率の位置ではないので直さない。
    const other = createScrollElement();
    other.raw.scrollTop = 500;
    anchor.update(other.element, 3, onAnchored);
    expect(other.raw.scrollTop).toBe(500);
    expect(onAnchored).toHaveBeenCalledTimes(2);
  });

  // 1.0.1 の確かめ直し G: 末尾までスクロールしていたときは末尾のまま(1.0.0 と同じ。末尾を追う表で 2 回描き直さない)。
  it('末尾にいたときは直さない。末尾より上にいたときは直す', () => {
    const { element, raw } = createScrollElement();
    Object.assign(raw, { scrollHeight: 15_000_200 });
    const anchor = createScrollScaleAnchor();
    const onAnchored = vi.fn();
    raw.scrollTop = 15_000_000;
    anchor.update(element, 2.4, onAnchored);
    anchor.update(element, 2.5, onAnchored);
    expect(raw.scrollTop).toBe(15_000_000);
    expect(onAnchored).not.toHaveBeenCalled();
    raw.scrollTop = 14_000_000;
    anchor.update(element, 2.6, onAnchored);
    expect(raw.scrollTop).toBeCloseTo((14_000_000 * 2.5) / 2.6, 3);
    expect(onAnchored).toHaveBeenCalledTimes(1);
  });
});