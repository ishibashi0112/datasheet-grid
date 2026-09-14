// 追加(proposals ⑧): スクロール位置 API(getScrollPosition / setScrollPosition / onScroll)の
//   結合テストです。jsdom は実レイアウト / 実スクロールを持たないため、
//   - installJsdomLayoutStubs で行・列を描画させ、
//   - scrollTo を「scrollTop / scrollLeft を即時反映して scroll イベントを発火する」スタブ、
//   - scrollHeight / scrollWidth を大きな固定値の getter
//   に差し替えて、クランプ・source 判定・rAF 間引きの配線を検証します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  GridScrollEventParams,
  SpreadsheetGridHandle,
} from './model/gridTypes';

type Row = { id: number; name: string };

const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  name: `row-${i}`,
}));

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 100 },
  { key: 'name', title: '名前', width: 200 },
];

// rAF 通知(間引き)を 1 フレームぶん流します。
const flushAnimationFrame = async () => {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
};

beforeAll(() => {
  installJsdomLayoutStubs();
  // スクロール可能量(クランプ上限)を与えます。jsdom の既定は 0 のため、
  //   0 のままだと setScrollPosition がすべて 0 へクランプされます。
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 10000,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => 5000,
  });
  // scrollTo: 位置を即時反映して scroll イベントを発火します(behavior 'auto' 相当)。
  Element.prototype.scrollTo = function scrollToStub(
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    const options: ScrollToOptions =
      typeof optionsOrX === 'number'
        ? { left: optionsOrX, top: y }
        : (optionsOrX ?? {});
    const before = { top: this.scrollTop, left: this.scrollLeft };
    if (options.top !== undefined) {
      this.scrollTop = options.top;
    }
    if (options.left !== undefined) {
      this.scrollLeft = options.left;
    }
    if (before.top !== this.scrollTop || before.left !== this.scrollLeft) {
      this.dispatchEvent(new Event('scroll'));
    }
  };
});

afterEach(() => {
  cleanup();
});

function renderGrid(onScroll?: (params: GridScrollEventParams) => void) {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const utils = render(
    <SpreadsheetGrid<Row>
      rows={rows}
      columns={columns}
      ref={ref}
      onScroll={onScroll}
    />,
  );
  const scrollEl = utils.container.querySelector('.ssg-scroll-container');
  if (!(scrollEl instanceof HTMLElement)) {
    throw new Error('スクロールコンテナが見つかりません');
  }
  return { ...utils, ref, scrollEl };
}

describe('スクロール位置 API(proposals ⑧)', () => {
  it('getScrollPosition が現在位置を返し、setScrollPosition が省略側を維持して反映する', async () => {
    const { ref } = renderGrid();
    expect(ref.current?.getScrollPosition()).toEqual({ top: 0, left: 0 });

    await act(async () => {
      ref.current?.setScrollPosition({ top: 300 });
    });
    expect(ref.current?.getScrollPosition()).toEqual({ top: 300, left: 0 });

    // left のみ指定 → top は維持。
    await act(async () => {
      ref.current?.setScrollPosition({ left: 120 });
    });
    expect(ref.current?.getScrollPosition()).toEqual({ top: 300, left: 120 });
  });

  it('setScrollPosition はスクロール可能範囲へクランプする', async () => {
    const { ref, scrollEl } = renderGrid();
    await act(async () => {
      ref.current?.setScrollPosition({ top: 999999, left: -50 });
    });
    // maxTop = scrollHeight(10000) - clientHeight(600) / left は 0 未満 → 0。
    expect(scrollEl.scrollTop).toBe(9400);
    expect(scrollEl.scrollLeft).toBe(0);
  });

  it('onScroll: API 由来は source "api"、ユーザー由来は source "user" で通知される', async () => {
    const events: GridScrollEventParams[] = [];
    const { ref, scrollEl } = renderGrid((params) => events.push(params));

    await act(async () => {
      ref.current?.setScrollPosition({ top: 200 });
    });
    await flushAnimationFrame();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ top: 200, left: 0, source: 'api' });

    // ユーザースクロール相当(位置を直接変えて scroll イベントを発火)。
    await act(async () => {
      scrollEl.scrollTop = 240;
      scrollEl.dispatchEvent(new Event('scroll'));
    });
    await flushAnimationFrame();
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ top: 240, left: 0, source: 'user' });

    // scrollToTop(命令的 API)も 'api' として通知される。
    await act(async () => {
      ref.current?.scrollToTop();
    });
    await flushAnimationFrame();
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ top: 0, left: 0, source: 'api' });
  });

  it('位置が変わらない setScrollPosition は通知されず、次のユーザースクロールを api と誤判定しない', async () => {
    const events: GridScrollEventParams[] = [];
    const { ref, scrollEl } = renderGrid((params) => events.push(params));

    // 現在位置(0, 0)と同じ位置への API スクロール → scroll イベントなし。
    await act(async () => {
      ref.current?.setScrollPosition({ top: 0, left: 0 });
    });
    await flushAnimationFrame();
    expect(events).toHaveLength(0);

    // 直後のユーザースクロールは 'user' のまま。
    await act(async () => {
      scrollEl.scrollTop = 50;
      scrollEl.dispatchEvent(new Event('scroll'));
    });
    await flushAnimationFrame();
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('user');
  });

  it('同一フレームの連続イベントは rAF で 1 回に間引かれ、最後の位置で通知される', async () => {
    const events: GridScrollEventParams[] = [];
    const { scrollEl } = renderGrid((params) => events.push(params));

    await act(async () => {
      scrollEl.scrollTop = 10;
      scrollEl.dispatchEvent(new Event('scroll'));
      scrollEl.scrollTop = 20;
      scrollEl.dispatchEvent(new Event('scroll'));
      scrollEl.scrollTop = 30;
      scrollEl.dispatchEvent(new Event('scroll'));
    });
    await flushAnimationFrame();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ top: 30, left: 0, source: 'user' });
  });
});