// 追加(非依存化 ③-19): 行ドラッグコントローラの単体テストです。スロット解決 / キャンセル / pointerId フィルタ等は
//   hooks/useRowDragController.test.ts(hook 経由)が担うため、ここではコントローラ固有の契約(ドラッグ中行の
//   淡色属性の付け外し、dispose の後始末、update で enabled が切り替わること)を検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import {
  createRowDragController,
  type RowDragArgs,
  type RowDragHandlePointerEvent,
} from './rowDragController';
import { createUniformRowMetrics } from '../logic/verticalGeometry';

const makeRect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

// 行高 10px × 10 行。コンテナと中央ペインは原点 (0, 0)、高さ 100。
const makeArgs = () => {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => makeRect(0, 0, 200, 100);
  Object.defineProperty(container, 'clientWidth', { value: 200 });
  Object.defineProperty(container, 'clientHeight', { value: 100 });
  Object.defineProperty(container, 'scrollHeight', { value: 100 });
  for (let i = 0; i < 10; i += 1) {
    const row = document.createElement('div');
    row.className = 'ssg-body-row';
    row.dataset.rowIndex = String(i);
    container.appendChild(row);
  }
  document.body.appendChild(container);
  const body = document.createElement('div');
  body.getBoundingClientRect = () => makeRect(0, 0, 200, 100);
  const commitRowMove = vi.fn<(from: number, to: number) => void>();
  const args: RowDragArgs = {
    enabled: true,
    rowMetrics: createUniformRowMetrics(10, 10),
    headerHeight: 0,
    verticalScaleFactor: 1,
    windowBaseOffsetPx: 0,
    scrollContainerRef: { current: container },
    bodyScrollRef: { current: body },
    leftIndicatorRef: { current: document.createElement('div') },
    centerIndicatorRef: { current: document.createElement('div') },
    rightIndicatorRef: { current: document.createElement('div') },
    getRowDragLabel: (index) => `行 ${index}`,
    commitRowMove,
  };
  return { args, container, commitRowMove };
};

const handleEvent = (overrides: Partial<RowDragHandlePointerEvent> = {}): RowDragHandlePointerEvent => ({
  button: 0,
  pointerId: 1,
  clientX: 20,
  clientY: 15,
  currentTarget: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
  preventDefault: () => {},
  stopPropagation: () => {},
  ...overrides,
});

const dispatchPointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
  const event = new window.PointerEvent(type, { pointerId, clientX, clientY, bubbles: true });
  if (event.pointerId !== pointerId) {
    Object.defineProperty(event, 'pointerId', { value: pointerId });
  }
  window.dispatchEvent(event);
};

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.cursor = '';
  document.body.innerHTML = '';
});

describe('rowDragController', () => {
  it('掴んだ行に淡色属性を付け、ガイド線を出し、up で commitRowMove(from, to) を呼んで属性を外す', () => {
    const controller = createRowDragController();
    const { args, container, commitRowMove } = makeArgs();
    controller.update(args);

    // 行 1(y=10..20)を掴む。
    controller.onRowDragHandlePointerDown(1, handleEvent());
    const row1 = container.querySelector('[data-row-index="1"]')!;
    expect(row1.hasAttribute('data-ssg-row-dragging')).toBe(true);
    expect(document.querySelector('[data-grid-drag-ghost]')?.textContent).toBe('行 1');
    // 直上 / 直下(slot 1 / 2)はガイド線なし。
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');

    // y=47 → slot 5(行 4 の後半)= 行 4 の下(y=50)にガイド線。
    dispatchPointer('pointermove', 1, 20, 47);
    expect(args.centerIndicatorRef.current?.style.display).toBe('block');
    expect(args.centerIndicatorRef.current?.style.top).toBe('50px');

    dispatchPointer('pointerup', 1, 20, 47);
    expect(commitRowMove).toHaveBeenCalledWith(1, 4);
    expect(row1.hasAttribute('data-ssg-row-dragging')).toBe(false);
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(document.body.style.cursor).toBe('');
    controller.dispose();
  });

  it('ドラッグ中に dispose すると属性 / ゴースト / cursor / window リスナーを後始末する', () => {
    const controller = createRowDragController();
    const { args, container, commitRowMove } = makeArgs();
    controller.update(args);
    controller.onRowDragHandlePointerDown(2, handleEvent());
    controller.dispose();
    const row2 = container.querySelector('[data-row-index="2"]')!;
    expect(row2.hasAttribute('data-ssg-row-dragging')).toBe(false);
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(document.body.style.cursor).toBe('');
    dispatchPointer('pointerup', 1, 20, 80);
    expect(commitRowMove).not.toHaveBeenCalled();
  });

  it('update で enabled=false にすると以後のドラッグは開始しない', () => {
    const controller = createRowDragController();
    const { args } = makeArgs();
    controller.update({ ...args, enabled: false });
    controller.onRowDragHandlePointerDown(0, handleEvent());
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    controller.dispose();
  });
});