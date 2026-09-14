// 追加(非依存化 ③-14): useColumnMenuController の特性テストです(抽出前に現状の挙動を固定)。
//   ボタン / 右クリックからの open、同じボタン再押下でのトグル close、タッチは click で確定、
//   外側 pointerdown / Escape で close、アンカーが DOM から消えたら close を検証します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MouseEvent, PointerEvent } from 'react';
import { useColumnMenuController } from './useColumnMenuController';
import type { GridColumn } from '../model/gridTypes';

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

type Row = { a: number };
const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'A', width: 100 },
  { key: 'b', title: 'B', width: 100 },
];

const makeButton = () => {
  const button = document.createElement('button');
  document.body.appendChild(button);
  return button;
};
const pointerEvent = (button: HTMLButtonElement, init: Partial<{ button: number; pointerType: string }> = {}) =>
  ({
    button: init.button ?? 0,
    pointerType: init.pointerType ?? 'mouse',
    currentTarget: button,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as PointerEvent<HTMLButtonElement>;
const clickEvent = (button: HTMLButtonElement) =>
  ({ currentTarget: button, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as MouseEvent<HTMLButtonElement>;
const contextEvent = (x: number, y: number) =>
  ({ clientX: x, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as MouseEvent<HTMLDivElement>;

const setup = (enableColumnMenu = true) => {
  const root = document.createElement('div');
  root.tabIndex = 0;
  document.body.appendChild(root);
  const gridRootRef = { current: root };
  const view = renderHook(() =>
    useColumnMenuController<Row>({ visibleColumns: columns, enableColumnMenu, gridRootRef }),
  );
  return { ...view, root };
};

describe('useColumnMenuController(特性テスト)', () => {
  it('ボタンから開き、同じボタンの再押下で閉じる。無効時 / 副ボタンは開かない', () => {
    const t = setup();
    const button = makeButton();
    act(() => {
      t.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(true);
    expect(t.result.current.openedMenuColumnKey).toBe('a');
    expect(t.result.current.openedMenuColumn?.key).toBe('a');
    expect(t.result.current.columnMenuLayout).toMatchObject({ width: 200 });
    act(() => {
      t.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(false);
    act(() => {
      t.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button, { button: 2 }));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(false);

    const disabled = setup(false);
    act(() => {
      disabled.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button));
    });
    expect(disabled.result.current.isColumnMenuOpen).toBe(false);
  });

  it('タッチは pointerdown では開かず、同じボタンの click で開く。右クリックは座標アンカーで開く', () => {
    const t = setup();
    const button = makeButton();
    act(() => {
      t.result.current.openColumnMenuFromButton(columns[1], pointerEvent(button, { pointerType: 'touch' }));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(false);
    act(() => {
      t.result.current.openColumnMenuFromButtonClick(columns[1], clickEvent(button));
    });
    expect(t.result.current.openedMenuColumnKey).toBe('b');
    act(() => {
      t.result.current.closeColumnMenu();
    });
    act(() => {
      t.result.current.openColumnMenuFromContextMenu(columns[0], contextEvent(300, 200));
    });
    expect(t.result.current.openedMenuColumnKey).toBe('a');
    expect(t.result.current.columnMenuLayout).toMatchObject({ left: 300, top: 200 });
  });

  it('外側 pointerdown / Escape で閉じ(rAF で root へフォーカス復帰)、アンカーボタンが消えると閉じる', () => {
    const t = setup();
    const button = makeButton();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    act(() => {
      t.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button));
    });
    t.result.current.columnMenuRef.current = panel;
    act(() => {
      panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(true);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(false);
    act(() => {
      rafCallbacks.splice(0).forEach((cb) => cb(0));
    });
    expect(document.activeElement).toBe(t.root);

    act(() => {
      t.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(false);

    act(() => {
      t.result.current.openColumnMenuFromButton(columns[0], pointerEvent(button));
    });
    button.remove();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(t.result.current.isColumnMenuOpen).toBe(false);
  });
});