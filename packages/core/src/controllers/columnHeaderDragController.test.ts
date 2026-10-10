// 追加(非依存化 ③-18): 列ヘッダー D&D コントローラの単体テストです。window リスナーの後始末系は
//   hooks/useColumnHeaderDragController.test.ts(hook 経由)が担うため、ここでは permutation の純関数と
//   「pointerdown → move でインジケータ / ゴースト → up で commit」の 1 往復、dispose の後始末を検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import {
  computeHeaderReorderedKeys,
  createColumnHeaderDragController,
  resolveConsumerDropSlot,
  type ColumnDragHandlePointerEvent,
  type ColumnHeaderDragArgs,
} from './columnHeaderDragController';
import type { GridColumn, GridColumnPinned } from '../model/gridTypes.unbound';
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

  // 追加(motion-9 / M-12): live 方式。同じペイン内は掴んだ列がポインタに追従し、通る先の列が退避する(縦線 / ゴーストなし)。
  //   別ペイン(固定)へ移すときは縦線 + ゴーストに切り替わり、列は基準位置へ戻る。枠外は直前の位置を保ち、Esc で戻る。
  const mountCells = (container: HTMLElement) => {
    const cells: Record<string, HTMLElement[]> = {};
    for (const key of ['a', 'b', 'd']) {
      cells[key] = [0, 1].map(() => {
        const cell = document.createElement('div');
        cell.dataset.ssgColKey = key;
        container.appendChild(cell);
        return cell;
      });
    }
    document.body.appendChild(container);
    return cells;
  };

  it("motion='live': 掴んだ列が追従し、通る先の列が退避し、枠外でも直前の位置で commit する", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const cells = mountCells(args.scrollContainerRef.current!);
    controller.update({ ...args, motion: 'live' });

    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');

    // x=280 → slot 3 → target 2。列 a は +240px 追従、b / d は a の幅(100px)ぶん左へ退避。
    dispatchPointer('pointermove', 1, 280, 10);
    for (const cell of cells.a) {
      expect(cell.style.transform).toBe('translateX(240px)');
      expect(cell.getAttribute('data-ssg-col-dragging')).toBe('live');
      expect(cell.style.zIndex).toBe('4');
    }
    expect(cells.b[1].style.transform).toBe('translateX(-100px)');
    expect(cells.d[0].style.transform).toBe('translateX(-100px)');
    expect(cells.d[0].style.transition).toContain('transform');
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');

    // x=160 → slot 2 → target 1(b と d の間)。b は退避したまま、d の退避は戻る。
    dispatchPointer('pointermove', 1, 160, 10);
    expect(cells.b[0].style.transform).toBe('translateX(-100px)');
    expect(cells.d[0].style.transform).toBe('translateX(0px)');

    // 枠外へ出ても直前の位置を保つ。
    dispatchPointer('pointermove', 1, 900, 10);
    expect(cells.b[0].style.transform).toBe('translateX(-100px)');
    dispatchPointer('pointerup', 1, 900, 10);
    expect(args.applyColumnOrderAndPin).toHaveBeenCalledTimes(1);
    expect(args.applyColumnOrderAndPin.mock.calls[0][0]).toEqual(['b', 'c', 'a', 'd']);
    // 確定時は inline style を外す(新しい位置への settle は applyReorderSettle が担う)。
    for (const cell of [...cells.a, ...cells.b, ...cells.d]) {
      expect(cell.style.transform).toBe('');
      expect(cell.style.zIndex).toBe('');
      expect(cell.hasAttribute('data-ssg-col-dragging')).toBe(false);
    }
    controller.dispose();
  });

  it("motion='live': 別ペイン(空の左固定ペイン帯)ではゴースト + 縦線に切り替わり、Esc で元へ戻る", () => {
    vi.useFakeTimers();
    try {
      const controller = createColumnHeaderDragController<Row>();
      const args = makeArgs();
      const cells = mountCells(args.scrollContainerRef.current!);
      controller.update({
        ...args,
        leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
        motion: 'live',
      });

      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 280, 10);
      expect(cells.d[0].style.transform).toBe('translateX(-100px)');

      // x=10 は空の左固定ペインのドロップ帯 → 縦線 + ゴースト。列は基準位置へ戻る。
      dispatchPointer('pointermove', 1, 10, 10);
      expect(document.querySelector('[data-grid-drag-ghost]')?.textContent).toBe('A');
      expect(args.leftIndicatorRef.current?.style.display).toBe('block');
      expect(cells.a[0].style.transform).toBe('translateX(0px)');
      expect(cells.a[0].hasAttribute('data-ssg-col-dragging')).toBe(false);
      expect(cells.d[0].style.transform).toBe('translateX(0px)');

      // 中央へ戻るとゴーストが消え、追従に戻る。
      dispatchPointer('pointermove', 1, 280, 10);
      expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
      expect(cells.a[0].style.transform).toBe('translateX(240px)');

      // Escape: commit せず、基準位置へ戻してから inline style を外す。
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();
      expect(document.body.style.cursor).toBe('');
      expect(cells.a[0].style.transform).toBe('translateX(0px)');
      expect(cells.d[0].style.transform).toBe('translateX(0px)');
      vi.advanceTimersByTime(300);
      expect(cells.a[0].style.transform).toBe('');
      expect(cells.a[0].style.zIndex).toBe('');
      expect(cells.d[0].style.transition).toBe('');

      // 左固定ペインへ離すと pin 付きで commit する。
      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 10, 10);
      dispatchPointer('pointerup', 1, 10, 10);
      expect(args.applyColumnOrderAndPin.mock.calls[0][1]).toEqual(new Map([['a', 'left']]));
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ghost 方式でも Escape でキャンセルできる', () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    controller.update(args);
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 280, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');
    dispatchPointer('pointerup', 1, 280, 10);
    expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();
    controller.dispose();
  });

  // 追加(M-12 fix): 左固定列が無いとき、合成列(行ドラッグハンドル)が中央ペインの先頭に入る。grip を押して離すだけで
  //   右隣と入れ替わっていた(スロットが合成列ぶん 1 ずれていた)回帰テスト。合成列より前へは置けない。
  const withHandle = (motion: 'ghost' | 'live') => {
    const args = makeArgs();
    const handle: GridColumn<Row> = { key: '__ssg_row_drag_handle__', title: '', width: 28 };
    const entries = [handle, ...columns.filter((column) => column.visible !== false)].map((column, index) => ({
      column,
      logicalIndex: index,
      paneLocalStart: index === 0 ? 0 : 28 + (index - 1) * 100,
      paneLocalSize: index === 0 ? 28 : 100,
      paneLocalEnd: index === 0 ? 28 : 28 + index * 100,
    }));
    return {
      ...args,
      paneLayout: { ...paneLayout, center: { pane: 'center' as const, entries, totalWidth: 328 } },
      motion,
    };
  };

  for (const motion of ['ghost', 'live'] as const) {
    it(`合成列が中央の先頭にあっても、grip を押して離すだけでは並べ替えない(${motion})`, () => {
      const controller = createColumnHeaderDragController<Row>();
      const args = withHandle(motion);
      mountCells(args.scrollContainerRef.current!);
      controller.update(args);
      // 列 a(28..128)の grip 付近 x=110(中点 78 より右 = 直後のスロット)。
      controller.onColumnDragHandlePointerDown(columns[0], gripEvent({ clientX: 110 }));
      dispatchPointer('pointerup', 1, 110, 10);
      expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();

      // 列 b を合成列の上(x=5)へ運ぶと、合成列の直後(= 列 a の手前)に入る。
      controller.onColumnDragHandlePointerDown(columns[1], gripEvent({ clientX: 210 }));
      dispatchPointer('pointermove', 1, 5, 10);
      dispatchPointer('pointerup', 1, 5, 10);
      expect(args.applyColumnOrderAndPin.mock.calls[0][0]).toEqual(['b', 'a', 'c', 'd']);
      controller.dispose();
    });
  }
});

describe('resolveConsumerDropSlot', () => {
  it('合成列を除いたアンカー列で consumer の表示列 index へ換算する', () => {
    const handle: GridColumn<Row> = { key: '__ssg_row_drag_handle__', title: '', width: 28 };
    const geometry: PaneGeometry<Row> = {
      pane: 'center',
      entries: [handle, columns[0], columns[1], columns[3]].map((column, index) => ({
        column,
        logicalIndex: index,
        paneLocalStart: index * 100,
        paneLocalSize: 100,
        paneLocalEnd: index * 100 + 100,
      })),
      totalWidth: 400,
    };
    // consumer の表示列は [a, b, d](c は非表示)。
    expect(resolveConsumerDropSlot(columns, geometry, 'center', 0)).toBe(0);
    expect(resolveConsumerDropSlot(columns, geometry, 'center', 1)).toBe(0);
    expect(resolveConsumerDropSlot(columns, geometry, 'center', 2)).toBe(1);
    expect(resolveConsumerDropSlot(columns, geometry, 'center', 3)).toBe(2);
    expect(resolveConsumerDropSlot(columns, geometry, 'center', 4)).toBe(3);
  });
});