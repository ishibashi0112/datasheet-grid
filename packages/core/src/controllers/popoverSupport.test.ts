// 追加(非依存化 ③-13): popoverSupport(window リスナーの束 / フォーカス制御)のテストです。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blurForPopover,
  createPopoverWindowBindings,
  isInsideGridRoot,
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
    expect(handlers.onOutsidePointerDown).toHaveBeenCalledWith(document.body);
    expect(handlers.onKeyDown).toHaveBeenCalledTimes(1);

    bindings.detach();
    bindings.detach();
    expect(bindings.isAttached()).toBe(false);
    window.dispatchEvent(new Event('resize'));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(handlers.onResize).toHaveBeenCalledTimes(1);
    expect(handlers.onOutsidePointerDown).toHaveBeenCalledTimes(1);
  });

  // 追加(段階 2 DF-23): クリック以外(element.click() やショートカット)で display: none のタブへ切り替えてグリッドが隠れても、
  //   ポップオーバーが別の画面の上に残っていました。開いている間だけグリッドの大きさを見張り、0 × 0 になったら知らせます。
  it('開いている間にグリッドが隠れたら(0 × 0)onGridHidden を呼ぶ。大きさが変わっただけ / 閉じた後は呼ばない', () => {
    const callbacks: ((entries: { contentRect: { width: number; height: number } }[]) => void)[] = [];
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {
        callbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const root = document.createElement('div');
    document.body.appendChild(root);
    let rect = { width: 800, height: 400 };
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => ({ ...rect, top: 0, left: 0 }) as DOMRect);
    const onGridHidden = vi.fn();
    const bindings = createPopoverWindowBindings({
      isInside: () => false,
      onOutsidePointerDown: () => {},
      getGridRoot: () => root,
      onGridHidden,
    });
    expect(callbacks).toHaveLength(0);
    bindings.attach();
    expect(callbacks).toHaveLength(1);
    const notify = (width: number, height: number) => callbacks[0]([{ contentRect: { width, height } }]);
    notify(800, 400);
    rect = { width: 500, height: 400 };
    notify(500, 400);
    expect(onGridHidden).not.toHaveBeenCalled();
    rect = { width: 0, height: 0 };
    notify(0, 0);
    expect(onGridHidden).toHaveBeenCalledTimes(1);
    bindings.detach();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('ResizeObserver が無い環境や、グリッドの要素が無いときは何もしない', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const onGridHidden = vi.fn();
    const bindings = createPopoverWindowBindings({
      isInside: () => false,
      onOutsidePointerDown: () => {},
      getGridRoot: () => document.createElement('div'),
      onGridHidden,
    });
    expect(() => bindings.attach()).not.toThrow();
    bindings.detach();
    vi.unstubAllGlobals();
    const withoutRoot = createPopoverWindowBindings({
      isInside: () => false,
      onOutsidePointerDown: () => {},
      getGridRoot: () => null,
      onGridHidden,
    });
    expect(() => withoutRoot.attach()).not.toThrow();
    withoutRoot.detach();
    expect(onGridHidden).not.toHaveBeenCalled();
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

  // 追加(1.0.1 / AP-10): メニューの onSelect で編集を始めたときは、開いたエディタからフォーカスを奪わない。
  it('閉じた後の rAF の時点でセルのエディタにフォーカスがあれば奪わない', () => {
    const root = document.createElement('div');
    root.tabIndex = 0;
    const editor = document.createElement('div');
    editor.className = 'ssg-cell-editor';
    const input = document.createElement('input');
    editor.appendChild(input);
    root.appendChild(editor);
    document.body.append(root);
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    restoreGridFocus({ current: root });
    input.focus();
    for (const cb of callbacks) cb(0);
    expect(document.activeElement).toBe(input);
    vi.unstubAllGlobals();
  });
});

describe('isInsideGridRoot(監査 C-3)', () => {
  it('押下先が root の内側のときだけ true(外側クリックで閉じたときのフォーカス復帰判定)', () => {
    const root = document.createElement('div');
    const cell = document.createElement('div');
    root.appendChild(cell);
    const outside = document.createElement('input');
    document.body.append(root, outside);
    expect(isInsideGridRoot({ current: root }, cell)).toBe(true);
    expect(isInsideGridRoot({ current: root }, root)).toBe(true);
    expect(isInsideGridRoot({ current: root }, outside)).toBe(false);
    expect(isInsideGridRoot({ current: null }, cell)).toBe(false);
  });
});