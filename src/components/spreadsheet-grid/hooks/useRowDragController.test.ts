// row-drag batch 4: 行ドラッグ controller の後始末 / ヒットテスト / commit 経路の契約テストです。
//   列 D&D(useColumnHeaderDragController.test.ts)と同じく、move/up/cancel リスナーが「window 登録 +
//   pointerId フィルタ」であること(仮想化でハンドルが unmount しても終了できる)を本命に、
//   スロット解決 → commitRowMove(from, to) と、無効(enabled=false)/ 枠外 / Escape / unmount の
//   各キャンセル経路を renderHook で直接検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { useRowDragController } from './useRowDragController';
import { createUniformRowMetrics } from '../logic/verticalGeometry';

afterEach(() => {
  cleanup();
  document.body.style.cursor = '';
});

const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 40;

// コンテナ / 中央ペインの矩形をスタブした要素を作ります(jsdom は常に 0 矩形のため)。
const makeBox = (rect: Partial<DOMRect>) => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
  return el;
};

const makeArgs = (overrides: Partial<Parameters<typeof useRowDragController>[0]> = {}) => ({
  enabled: true,
  rowMetrics: createUniformRowMetrics(5, ROW_HEIGHT),
  headerHeight: HEADER_HEIGHT,
  verticalScaleFactor: 1,
  windowBaseOffsetPx: 0,
  scrollContainerRef: { current: makeBox({}) },
  bodyScrollRef: { current: makeBox({}) },
  getRowDragLabel: (viewIndex: number) => `row-${viewIndex}`,
  commitRowMove: vi.fn(),
  ...overrides,
});

const makeHandlePointerDownEvent = (
  handle: HTMLElement,
  pointerId: number,
  clientY: number,
): ReactPointerEvent<HTMLElement> =>
  ({
    button: 0,
    pointerId,
    clientX: 100,
    clientY,
    currentTarget: handle,
    preventDefault: () => {},
    stopPropagation: () => {},
  }) as unknown as ReactPointerEvent<HTMLElement>;

const dispatchWindowPointerEvent = (
  type: string,
  pointerId: number,
  clientY = 10,
) => {
  const ev = new window.PointerEvent(type, {
    pointerId,
    clientX: 100,
    clientY,
    bubbles: true,
  });
  if (ev.pointerId !== pointerId) {
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
  }
  window.dispatchEvent(ev);
};

const rowY = (index: number, offset: number) =>
  HEADER_HEIGHT + index * ROW_HEIGHT + offset;

describe('useRowDragController', () => {
  it('ハンドルが document 外(unmount 相当)でも window の pointerup でドラッグが終了する', () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRowDragController(args));
    const handle = document.createElement('span');

    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
      );
    });
    expect(document.body.style.cursor).toBe('grabbing');
    // ゴーストが body 直下に生成され、ラベルが入ります。
    expect(document.querySelector('[data-grid-drag-ghost]')?.textContent).toBe(
      'row-0',
    );

    act(() => {
      dispatchWindowPointerEvent('pointerup', 1, rowY(0, 5));
    });
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    // 同じ位置(slot 0 / 1 = 動かない)なので commit されません。
    expect(args.commitRowMove).not.toHaveBeenCalled();
  });

  it('別 pointerId の pointerup では終了しない(pointerId フィルタ)', () => {
    const { result } = renderHook(() => useRowDragController(makeArgs()));
    const handle = document.createElement('span');
    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
      );
    });
    act(() => {
      dispatchWindowPointerEvent('pointerup', 2);
    });
    expect(document.body.style.cursor).toBe('grabbing');
    act(() => {
      dispatchWindowPointerEvent('pointerup', 1);
    });
    expect(document.body.style.cursor).toBe('');
  });

  it('pointermove でスロットを解決してガイド線を出し、pointerup で commitRowMove(from, to) が呼ばれる', () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRowDragController(args));
    const indicator = document.createElement('div');
    indicator.style.display = 'none';
    result.current.centerIndicatorRef.current = indicator;
    const handle = document.createElement('span');

    act(() => {
      result.current.onRowDragHandlePointerDown(
        1,
        makeHandlePointerDownEvent(handle, 7, rowY(1, 5)),
      );
    });
    // 行 3 の下半分 → slot 4 → to = 3(from=1 を抜いた分 1 つ前)。ガイド線 top = header + 4 行分。
    act(() => {
      dispatchWindowPointerEvent('pointermove', 7, rowY(3, ROW_HEIGHT - 3));
    });
    expect(indicator.style.display).toBe('block');
    expect(indicator.style.top).toBe(`${HEADER_HEIGHT + ROW_HEIGHT * 4}px`);

    act(() => {
      dispatchWindowPointerEvent('pointerup', 7, rowY(3, ROW_HEIGHT - 3));
    });
    expect(args.commitRowMove).toHaveBeenCalledTimes(1);
    expect(args.commitRowMove).toHaveBeenCalledWith(1, 3);
    expect(indicator.style.display).toBe('none');
    expect(document.body.style.cursor).toBe('');
  });

  it('前方へ(行 4 を行 0 の上へ)動かすと to = 0', () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRowDragController(args));
    const handle = document.createElement('span');
    act(() => {
      result.current.onRowDragHandlePointerDown(
        4,
        makeHandlePointerDownEvent(handle, 1, rowY(4, 5)),
      );
    });
    act(() => {
      dispatchWindowPointerEvent('pointermove', 1, rowY(0, 2));
    });
    act(() => {
      dispatchWindowPointerEvent('pointerup', 1, rowY(0, 2));
    });
    expect(args.commitRowMove).toHaveBeenCalledWith(4, 0);
  });

  it('枠外(コンテナ矩形の外)で離すとキャンセル(commit しない)', () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRowDragController(args));
    const indicator = document.createElement('div');
    result.current.centerIndicatorRef.current = indicator;
    const handle = document.createElement('span');
    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
      );
    });
    act(() => {
      dispatchWindowPointerEvent('pointermove', 1, rowY(3, 15));
    });
    expect(indicator.style.display).toBe('block');
    act(() => {
      dispatchWindowPointerEvent('pointermove', 1, 1000);
    });
    expect(indicator.style.display).toBe('none');
    act(() => {
      dispatchWindowPointerEvent('pointerup', 1, 1000);
    });
    expect(args.commitRowMove).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('');
  });

  it('Escape / pointercancel でキャンセルし、以後の pointerup は無視される', () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRowDragController(args));
    const handle = document.createElement('span');
    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
      );
    });
    act(() => {
      dispatchWindowPointerEvent('pointermove', 1, rowY(3, 15));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.body.style.cursor).toBe('');
    act(() => {
      dispatchWindowPointerEvent('pointerup', 1, rowY(3, 15));
    });
    expect(args.commitRowMove).not.toHaveBeenCalled();

    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 2, rowY(0, 5)),
      );
    });
    act(() => {
      dispatchWindowPointerEvent('pointercancel', 2);
    });
    expect(document.body.style.cursor).toBe('');
    expect(args.commitRowMove).not.toHaveBeenCalled();
  });

  it('enabled=false / 非左ボタンではドラッグを開始しない', () => {
    const disabled = makeArgs({ enabled: false });
    const { result } = renderHook(() => useRowDragController(disabled));
    const handle = document.createElement('span');
    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
      );
    });
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();

    const enabled = makeArgs();
    const { result: enabledResult } = renderHook(() => useRowDragController(enabled));
    act(() => {
      enabledResult.current.onRowDragHandlePointerDown(0, {
        ...makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
        button: 2,
      } as ReactPointerEvent<HTMLElement>);
    });
    expect(document.body.style.cursor).toBe('');
  });

  it('ドラッグ中に controller が unmount しても cursor / ゴースト / window リスナーを後始末する', () => {
    const args = makeArgs();
    const { result, unmount } = renderHook(() => useRowDragController(args));
    const handle = document.createElement('span');
    act(() => {
      result.current.onRowDragHandlePointerDown(
        0,
        makeHandlePointerDownEvent(handle, 1, rowY(0, 5)),
      );
    });
    expect(document.querySelector('[data-grid-drag-ghost]')).not.toBeNull();
    unmount();
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    act(() => {
      dispatchWindowPointerEvent('pointerup', 1, rowY(3, 15));
    });
    expect(args.commitRowMove).not.toHaveBeenCalled();
  });

  it('公開ハンドラは引数が変わっても参照が安定している(行 memo 維持)', () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useRowDragController>[0]) =>
        useRowDragController(props),
      { initialProps: makeArgs() },
    );
    const first = result.current.onRowDragHandlePointerDown;
    rerender(makeArgs({ enabled: false, headerHeight: 50 }));
    expect(result.current.onRowDragHandlePointerDown).toBe(first);
  });
});