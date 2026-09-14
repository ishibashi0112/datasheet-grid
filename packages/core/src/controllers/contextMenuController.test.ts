// 追加(非依存化 ③-13): contextMenuController のテストです(React 非依存で直接呼ぶ)。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContextMenuController } from './contextMenuController';
import type { GridContextMenuParams } from '../model/gridTypes.unbound';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const params = (x: number, y: number) =>
  ({ clientX: x, clientY: y }) as unknown as GridContextMenuParams<unknown>;
const items = [{ kind: 'action' as const, label: 'A', onSelect: () => {} }];

describe('contextMenuController', () => {
  it('open で配置(下にはみ出すなら上へ反転)、外側 pointerdown で閉じ、dispose でリスナーが外れる', () => {
    const c = createContextMenuController<unknown>();
    c.update({ gridRootRef: { current: null } });
    const listener = vi.fn();
    c.subscribe(listener);
    // window.innerHeight(jsdom 既定 768)の下端付近 → 反転して上へ。
    c.open(params(100, 760), items);
    const layout = c.getSnapshot().layout;
    expect(layout?.width).toBe(220);
    expect(layout?.top).toBeLessThan(760);
    expect(listener).toHaveBeenCalled();

    const panel = document.createElement('div');
    document.body.appendChild(panel);
    c.panelRef.current = panel;
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.getSnapshot().state).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.getSnapshot().state).toBeNull();
    expect(c.getSnapshot().layout).toBeNull();

    c.open(params(10, 10), items);
    c.dispose();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // dispose 後はリスナーが無いので状態は残る(アンマウント時のみ呼ばれる想定)。
    expect(c.getSnapshot().state).not.toBeNull();
  });
});