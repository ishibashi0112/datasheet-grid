// 追加(非依存化 ③-13): popoverSupport(window リスナーの束 / フォーカス制御)のテストです。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blurForPopover,
  createPopoverWindowBindings,
  restoreGridFocus,
} from './popoverSupport';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('createPopoverWindowBindings', () => {
  it('attach 中だけ resize / scroll / pointerdown(外側) / keydown を受け、detach で外れる(二重 attach は無害)', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const handlers = {
      onResize: vi.fn(),
      onScroll: vi.fn(),
      isInside: (target: Node) => panel.contains(target),
      onOutsidePointerDown: vi.fn(),
      onKeyDown: vi.fn(),
    };
    const bindings = createPopoverWindowBindings(handlers);
    window.dispatchEvent(new Event('resize'));
    expect(handlers.onResize).not.toHaveBeenCalled();

    bindings.attach();
    bindings.attach();
    expect(bindings.isAttached()).toBe(true);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handlers.onResize).toHaveBeenCalledTimes(1);
    expect(handlers.onScroll).toHaveBeenCalledTimes(1);
    expect(handlers.onOutsidePointerDown).toHaveBeenCalledTimes(1);
    expect(handlers.onKeyDown).toHaveBeenCalledTimes(1);

    bindings.detach();
    bindings.detach();
    expect(bindings.isAttached()).toBe(false);
    window.dispatchEvent(new Event('resize'));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(handlers.onResize).toHaveBeenCalledTimes(1);
    expect(handlers.onOutsidePointerDown).toHaveBeenCalledTimes(1);
  });
});

describe('blurForPopover / restoreGridFocus', () => {
  it('開く前にアクティブ要素と root を blur し、閉じた後の rAF で root へフォーカスを戻す', () => {
    const root = document.createElement('div');
    root.tabIndex = 0;
    const input = document.createElement('input');
    document.body.append(root, input);
    input.focus();
    expect(document.activeElement).toBe(input);
    blurForPopover(root);
    expect(document.activeElement).toBe(document.body);

    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    restoreGridFocus({ current: root });
    expect(document.activeElement).toBe(document.body);
    for (const cb of callbacks) cb(0);
    expect(document.activeElement).toBe(root);
    vi.unstubAllGlobals();
  });
});