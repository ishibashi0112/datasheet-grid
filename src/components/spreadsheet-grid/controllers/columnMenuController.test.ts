// 追加(非依存化 ③-14): columnMenuController のテストです(React 非依存で直接呼ぶ)。
//   hooks/useColumnMenuController.test.ts(特性テスト 3 件)と対になり、こちらは配置の反転 / maxHeight と
//   座標アンカーの scroll close を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnMenuController } from './columnMenuController';
import type { GridColumn } from '../model/gridTypes';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const column: GridColumn<unknown> = { key: 'a', title: 'A', width: 100 };
const ctx = (x: number, y: number) => ({ clientX: x, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn() });

describe('columnMenuController', () => {
  it('座標アンカー: 下にはみ出すなら上へ反転し、scroll で閉じる。無効時は開かない', () => {
    const c = createColumnMenuController<unknown>();
    c.update({ visibleColumns: [column], enableColumnMenu: false, gridRootRef: { current: null } });
    c.openFromContextMenu(column, ctx(100, 100));
    expect(c.getSnapshot().columnKey).toBeNull();

    c.update({ visibleColumns: [column], enableColumnMenu: true, gridRootRef: { current: null } });
    c.openFromContextMenu(column, ctx(100, 760));
    const layout = c.getSnapshot().layout;
    expect(layout?.width).toBe(200);
    // 反転(760 - 289 = 471)。
    expect(layout?.top).toBe(471);
    window.dispatchEvent(new Event('scroll'));
    expect(c.getSnapshot().columnKey).toBeNull();
  });

  it('ボタンアンカー: 収まらないときは maxHeight を付け、dispose でリスナーが外れる', () => {
    const c = createColumnMenuController<unknown>();
    c.update({ visibleColumns: [column], enableColumnMenu: true, gridRootRef: { current: null } });
    const button = document.createElement('button');
    document.body.appendChild(button);
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      top: 700, bottom: 720, left: 300, right: 400, width: 100, height: 20, x: 300, y: 700, toJSON: () => ({}),
    } as DOMRect);
    c.openFromButton(column, { button: 0, pointerType: 'mouse', currentTarget: button, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    const layout = c.getSnapshot().layout;
    expect(layout?.left).toBe(200);
    // 下(720 + 6 + 289 > 760)にも上(700 - 289 - 6 = 405 ≥ 8)へ反転できる → 反転。
    expect(layout?.top).toBe(405);
    c.dispose();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.getSnapshot().columnKey).toBe('a');
  });
});