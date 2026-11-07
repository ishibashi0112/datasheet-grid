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

  // 追加(dogfood DF-17): 開いている間の ↓ / ↑ / Home / End は項目の間を移り、後ろのグリッドをスクロールさせない。
  //   Tab は閉じる。custom 項目の入力欄にフォーカスがあるときは触らない。
  it('↓ / ↑ / Home / End で項目(使えない項目は飛ばす)の間を移り、既定の動作を止め、Tab で閉じる', () => {
    const c = createContextMenuController<unknown>();
    c.update({ gridRootRef: { current: null } });
    c.open(params(10, 10), items);
    const panel = document.createElement('div');
    panel.setAttribute('role', 'menu');
    const makeItem = (label: string, disabled = false) => {
      const button = document.createElement('button');
      button.setAttribute('role', 'menuitem');
      button.textContent = label;
      button.disabled = disabled;
      panel.appendChild(button);
      return button;
    };
    const first = makeItem('A');
    makeItem('B', true);
    const third = makeItem('C');
    const input = document.createElement('input');
    panel.appendChild(input);
    document.body.appendChild(panel);
    c.panelRef.current = panel;
    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(press('PageDown')).toBe(true);
    expect(press('ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(first);
    press('ArrowDown');
    expect(document.activeElement).toBe(third);
    press('ArrowDown');
    expect(document.activeElement).toBe(first);
    press('ArrowUp');
    expect(document.activeElement).toBe(third);
    press('Home');
    expect(document.activeElement).toBe(first);
    press('End');
    expect(document.activeElement).toBe(third);
    // custom 項目の入力欄では触らない(カーソルの移動のまま)。
    input.focus();
    expect(press('Home')).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(c.getSnapshot().state).not.toBeNull();
    third.focus();
    expect(press('Tab')).toBe(true);
    expect(c.getSnapshot().state).toBeNull();
    c.dispose();
  });
});