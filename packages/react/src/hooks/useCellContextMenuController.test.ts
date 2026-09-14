// 追加(非依存化 ③-13): useCellContextMenuController の特性テストです(抽出前に現状の挙動を固定)。
//   open で配置が決まり、外側 pointerdown / Escape / scroll で閉じ、閉じた後の rAF で root へフォーカスが
//   戻ることを検証します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCellContextMenuController } from './useCellContextMenuController';
import type { GridContextMenuParams } from '../model/gridTypes';

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.body.innerHTML = '';
});
const flushRaf = () => {
  const pending = rafCallbacks.splice(0);
  for (const cb of pending) cb(0);
};

const params = (x: number, y: number) =>
  ({ clientX: x, clientY: y, target: { kind: 'cell' } }) as unknown as GridContextMenuParams<unknown>;
const items = [
  { kind: 'action' as const, label: 'A', onSelect: () => {} },
  { kind: 'action' as const, label: 'B', onSelect: () => {} },
];

const setup = () => {
  const root = document.createElement('div');
  root.tabIndex = 0;
  document.body.appendChild(root);
  const gridRootRef = { current: root };
  const view = renderHook(() => useCellContextMenuController<unknown>({ gridRootRef }));
  return { ...view, root };
};

describe('useCellContextMenuController(特性テスト)', () => {
  it('open で状態と配置(ビューポート内に clamp)が決まり、close で消えて rAF で root へフォーカスが戻る', () => {
    const t = setup();
    expect(t.result.current.isContextMenuOpen).toBe(false);
    act(() => {
      t.result.current.openContextMenu(params(-50, 10), items);
    });
    expect(t.result.current.isContextMenuOpen).toBe(true);
    expect(t.result.current.contextMenuState?.items).toHaveLength(2);
    // left は VIEWPORT_MARGIN(8)以上、width は 220。
    expect(t.result.current.contextMenuLayout).toMatchObject({ left: 8, width: 220 });
    act(() => {
      t.result.current.closeContextMenu();
    });
    expect(t.result.current.isContextMenuOpen).toBe(false);
    expect(t.result.current.contextMenuLayout).toBeNull();
    act(() => {
      flushRaf();
    });
    expect(document.activeElement).toBe(t.root);
  });

  it('外側の pointerdown / Escape / scroll で閉じ、パネル内の pointerdown では閉じない', () => {
    const t = setup();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    act(() => {
      t.result.current.openContextMenu(params(100, 100), items);
    });
    t.result.current.contextMenuRef.current = panel;
    act(() => {
      panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.isContextMenuOpen).toBe(true);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.isContextMenuOpen).toBe(false);

    act(() => {
      t.result.current.openContextMenu(params(100, 100), items);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(t.result.current.isContextMenuOpen).toBe(false);

    act(() => {
      t.result.current.openContextMenu(params(100, 100), items);
    });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(t.result.current.isContextMenuOpen).toBe(false);
  });
});