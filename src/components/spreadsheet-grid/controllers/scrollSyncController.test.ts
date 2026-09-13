// 追加(本体分解 E-6b): スクロール計測コントローラの単体テストです(初期計測 / scroll で scrollTop 反映 + onScroll の
//   rAF 間引き通知(user / api 判定、同一フレームの user 優先)/ ResizeObserver で viewport 再計測 / dispose で解除)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScrollSyncController } from './scrollSyncController';

let rafQueue: FrameRequestCallback[] = [];
let resizeCallback: (() => void) | null = null;
const disconnect = vi.fn();

const runFrame = () => {
  const callbacks = rafQueue;
  rafQueue = [];
  for (const callback of callbacks) {
    callback(0);
  }
};

const makeElement = () => {
  const el = document.createElement('div');
  let scrollTop = 0;
  let scrollLeft = 0;
  Object.defineProperty(el, 'scrollTop', { get: () => scrollTop, set: (v: number) => (scrollTop = v) });
  Object.defineProperty(el, 'scrollLeft', { get: () => scrollLeft, set: (v: number) => (scrollLeft = v) });
  Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true });
  return el;
};

beforeEach(() => {
  rafQueue = [];
  resizeCallback = null;
  disconnect.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createScrollSyncController', () => {
  it('最初の update で初期計測し、scroll で scrollTop を反映、onScroll は rAF で 1 回に間引く(user / api 判定)', () => {
    const controller = createScrollSyncController();
    const setViewState = vi.fn();
    const onScroll = vi.fn();
    const el = makeElement();
    el.scrollTop = 40;
    controller.update({ scrollContainerRef: { current: el }, setViewState, onScroll });
    expect(setViewState).toHaveBeenCalledWith({ scrollTop: 40, viewportHeight: 300, viewportWidth: 500 });

    // ユーザースクロール 2 回 → 同一フレームなら最後の位置を 1 回通知。
    el.scrollTop = 100;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 120;
    el.dispatchEvent(new Event('scroll'));
    expect(setViewState).toHaveBeenLastCalledWith({ scrollTop: 120 });
    expect(onScroll).not.toHaveBeenCalled();
    runFrame();
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll).toHaveBeenCalledWith({ top: 120, left: 0, source: 'user' });

    // API 由来: markApiScroll 後の scroll イベント 1 回が 'api'。
    controller.markApiScroll();
    el.scrollTop = 200;
    el.dispatchEvent(new Event('scroll'));
    runFrame();
    expect(onScroll).toHaveBeenLastCalledWith({ top: 200, left: 0, source: 'api' });
    // 同一フレームに api と user が混在したら user 優先。
    controller.markApiScroll();
    el.scrollTop = 210;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 220;
    el.dispatchEvent(new Event('scroll'));
    runFrame();
    expect(onScroll).toHaveBeenLastCalledWith({ top: 220, left: 0, source: 'user' });

    // onScroll を外しても scrollTop の反映は続く(通知だけ止まる)。
    controller.update({ scrollContainerRef: { current: el }, setViewState, onScroll: undefined });
    el.scrollTop = 300;
    el.dispatchEvent(new Event('scroll'));
    expect(setViewState).toHaveBeenLastCalledWith({ scrollTop: 300 });
    expect(rafQueue).toHaveLength(0);
  });

  it('ResizeObserver で viewport を再計測し、dispose でリスナー / observer を外す', () => {
    const controller = createScrollSyncController();
    const setViewState = vi.fn();
    const el = makeElement();
    // 要素が無い間は何もしない(次の update で要素が揃えば attach)。
    controller.update({ scrollContainerRef: { current: null }, setViewState, onScroll: undefined });
    expect(setViewState).not.toHaveBeenCalled();
    controller.update({ scrollContainerRef: { current: el }, setViewState, onScroll: undefined });
    Object.defineProperty(el, 'clientHeight', { value: 320, configurable: true });
    resizeCallback?.();
    expect(setViewState).toHaveBeenLastCalledWith({ viewportHeight: 320, viewportWidth: 500 });

    controller.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
    setViewState.mockClear();
    el.dispatchEvent(new Event('scroll'));
    expect(setViewState).not.toHaveBeenCalled();
  });
});