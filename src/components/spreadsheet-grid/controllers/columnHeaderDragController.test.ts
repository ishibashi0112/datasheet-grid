// 追加(非依存化 ③-18): 列ヘッダー D&D コントローラの単体テストです。window リスナーの後始末系は
//   hooks/useColumnHeaderDragController.test.ts(hook 経由)が担うため、ここでは permutation の純関数と
//   「pointerdown → move でインジケータ / ゴースト → up で commit」の 1 往復、dispose の後始末を検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import {
  computeHeaderReorderedKeys,
  createColumnHeaderDragController,
  type ColumnDragHandlePointerEvent,
  type ColumnHeaderDragArgs,
} from './columnHeaderDragController';
import type { GridColumn, GridColumnPinned } from '../model/gridTypes';
import type { GridPaneLayout, PaneGeometry } from '../logic/geometry';

type Row = { a: number; b: number; c: number; d: number };

const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'A', width: 100 },
  { key: 'b', title: 'B', width: 100 },
  { key: 'c', title: 'C', width: 100, visible: false },
  { key: 'd', title: 'D', width: 100 },
];

describe('computeHeaderReorderedKeys', () => {
  it('same-pane で後方へ動かすと除去ぶんの slot 補正が入り、非表示列は保全される', () => {
    // 表示列 [a, b, d]、a を slot 2(= d の手前)へ。
    expect(computeHeaderReorderedKeys(columns, 'a', 'center', 2)).toEqual(['b', 'c', 'a', 'd']);
    // 末尾(slot 3)へ。
    expect(computeHeaderReorderedKeys(columns, 'a', 'center', 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('同一 slot は no-op(null)、不明なキーも null', () => {
    expect(computeHeaderReorderedKeys(columns, 'b', 'center', 1)).toBeNull();
    expect(computeHeaderReorderedKeys(columns, 'b', 'center', 2)).toBeNull();
    expect(computeHeaderReorderedKeys(columns, 'zzz', 'center', 0)).toBeNull();
  });

  it('cross-pane(center → left)は左グループ先頭へ挿入され、順序は left+center+right の連結', () => {
    const pinned: GridColumn<Row>[] = [
      { key: 'a', title: 'A', width: 100, pinned: 'left' },
      ...columns.slice(1),
    ];
    expect(computeHeaderReorderedKeys(pinned, 'd', 'left', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(computeHeaderReorderedKeys(pinned, 'd', 'left', 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

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

const emptyPane = (pane: 'left' | 'right'): PaneGeometry<Row> => ({ pane, entries: [], totalWidth: 0 });

// 中央ペインに表示列 3 本(a / b / d、各 100px)。
const paneLayout: GridPaneLayout<Row> = {
  left: emptyPane('left'),
  center: {
    pane: 'center',
    entries: ['a', 'b', 'd'].map((key, index) => ({
      column: columns.find((column) => column.key === key)!,
      logicalIndex: index,
      paneLocalStart: index * 100,
      paneLocalSize: 100,
      paneLocalEnd: index * 100 + 100,
    })),
    totalWidth: 300,
  },
  right: emptyPane('right'),
};

const makeElement = (rect: DOMRect) => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => rect;
  return el;
};

type ApplyMock = ReturnType<
  typeof vi.fn<(keys: string[], pinOverride?: Map<string, GridColumnPinned | undefined>) => void>
>;

const makeArgs = (): ColumnHeaderDragArgs<Row> & { applyColumnOrderAndPin: ApplyMock } => {
  const scrollContainer = makeElement(makeRect(0, 0, 400, 300));
  Object.defineProperty(scrollContainer, 'clientWidth', { value: 400 });
  Object.defineProperty(scrollContainer, 'clientHeight', { value: 300 });
  Object.defineProperty(scrollContainer, 'scrollWidth', { value: 400 });
  return {
    enabled: true,
    columns,
    paneLayout,
    // 左右ペインは null(空ペイン帯の判定を通らない)。
    leftPaneScrollRef: { current: null },
    rightPaneScrollRef: { current: null },
    bodyScrollRef: { current: makeElement(makeRect(0, 0, 300, 300)) },
    scrollContainerRef: { current: scrollContainer },
    leftIndicatorRef: { current: document.createElement('div') },
    centerIndicatorRef: { current: document.createElement('div') },
    rightIndicatorRef: { current: document.createElement('div') },
    leftLeadingWidth: 0,
    centerLeadingWidth: 0,
    rightLeadingWidth: 0,
    applyColumnOrderAndPin: vi.fn<(keys: string[], pinOverride?: Map<string, GridColumnPinned | undefined>) => void>(),
  };
};

const gripEvent = (overrides: Partial<ColumnDragHandlePointerEvent> = {}): ColumnDragHandlePointerEvent => ({
  button: 0,
  pointerId: 1,
  clientX: 40,
  clientY: 10,
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

describe('columnHeaderDragController', () => {
  it('pointerdown でゴースト生成、move で中央インジケータ表示、up で並び替えを commit する', () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    controller.update(args);

    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    expect(document.body.style.cursor).toBe('grabbing');
    const ghost = document.querySelector('[data-grid-drag-ghost]');
    expect(ghost?.textContent).toBe('A');
    // 押下位置(x=40、列 a の中点 50 より左)は slot 0 = 縦線は x=0 に出る。
    expect(args.centerIndicatorRef.current?.style.display).toBe('block');
    expect(args.centerIndicatorRef.current?.style.left).toBe('0px');

    // x=280 は列 d(200..300)の後半 = slot 3(末尾)。
    dispatchPointer('pointermove', 1, 280, 10);
    expect(args.centerIndicatorRef.current?.style.left).toBe('300px');

    dispatchPointer('pointerup', 1, 280, 10);
    expect(args.applyColumnOrderAndPin).toHaveBeenCalledTimes(1);
    expect(args.applyColumnOrderAndPin.mock.calls[0][0]).toEqual(['b', 'c', 'd', 'a']);
    expect(args.applyColumnOrderAndPin.mock.calls[0][1]).toEqual(new Map([['a', undefined]]));
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(document.body.style.cursor).toBe('');
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');
    controller.dispose();
  });

  it('枠外で離すと commit しない、enabled=false では開始しない', () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    controller.update(args);
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 900, 10);
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');
    dispatchPointer('pointerup', 1, 900, 10);
    expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();

    controller.update({ ...args, enabled: false });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    expect(document.body.style.cursor).toBe('');
    controller.dispose();
  });

  it('ドラッグ中に dispose すると window リスナー / cursor / ゴーストを後始末し、以後の up は無視される', () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    controller.update(args);
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    controller.dispose();
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    dispatchPointer('pointerup', 1, 280, 10);
    expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();
  });
});