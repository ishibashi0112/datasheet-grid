// 追加(非依存化 ③-4): panelHeaderDragController のテストです(React 非依存で直接呼ぶ)。
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPanelHeaderDragController } from './panelHeaderDragController';

const pointerDown = (overrides: Partial<{
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}> = {}) => ({
  button: 0,
  pointerId: 1,
  clientX: 100,
  clientY: 50,
  target: null,
  preventDefault: vi.fn(),
  ...overrides,
});

const fire = (type: string, init: PointerEventInit) =>
  window.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));

describe('panelHeaderDragController', () => {
  it('開始後は同じ pointerId の move で差分位置を通知し、pointerup で終了する', () => {
    const controller = createPanelHeaderDragController();
    const onMove = vi.fn();
    const down = pointerDown();
    expect(
      controller.startFromPointerDown(down, { layout: { top: 20, left: 30 }, onMove }),
    ).toBe(true);
    expect(down.preventDefault).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(true);

    fire('pointermove', { pointerId: 1, clientX: 110, clientY: 65 });
    expect(onMove).toHaveBeenLastCalledWith(35, 40);
    // 別ポインタは無視。
    fire('pointermove', { pointerId: 2, clientX: 500, clientY: 500 });
    expect(onMove).toHaveBeenCalledTimes(1);
    fire('pointerup', { pointerId: 2 });
    expect(controller.isActive()).toBe(true);

    fire('pointerup', { pointerId: 1 });
    expect(controller.isActive()).toBe(false);
    fire('pointermove', { pointerId: 1, clientX: 999, clientY: 999 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('主ボタン以外 / フォーム部品上 / 未配置 / ドラッグ中は開始しない', () => {
    const controller = createPanelHeaderDragController();
    const onMove = vi.fn();
    const layout = { top: 0, left: 0 };
    expect(controller.startFromPointerDown(pointerDown({ button: 2 }), { layout, onMove })).toBe(false);
    const button = document.createElement('button');
    document.body.appendChild(button);
    expect(controller.startFromPointerDown(pointerDown({ target: button }), { layout, onMove })).toBe(false);
    button.remove();
    expect(controller.startFromPointerDown(pointerDown(), { layout: null, onMove })).toBe(false);
    expect(controller.startFromPointerDown(pointerDown(), { layout, onMove })).toBe(true);
    expect(controller.startFromPointerDown(pointerDown({ pointerId: 7 }), { layout, onMove })).toBe(false);
    fire('pointercancel', { pointerId: 1 });
    expect(controller.isActive()).toBe(false);
  });

  it('dispose は進行中のドラッグを中断し、以後の move を無視する', () => {
    const controller = createPanelHeaderDragController();
    const onMove = vi.fn();
    controller.startFromPointerDown(pointerDown(), { layout: { top: 0, left: 0 }, onMove });
    controller.dispose();
    expect(controller.isActive()).toBe(false);
    fire('pointermove', { pointerId: 1, clientX: 10, clientY: 10 });
    expect(onMove).not.toHaveBeenCalled();
    // 二重 dispose は無害。
    controller.dispose();
  });
});