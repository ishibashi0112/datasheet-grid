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
  //   header=true で各列の 1 本目を見出しセル(ラベル + 操作群)にします。attach=false ではスクロールコンテナを文書へ
  //   入れません(親 = シェルが無い = 浮かぶ列を置けない環境)。
  const mountCells = (container: HTMLElement, options: { header?: boolean; attach?: boolean } = {}) => {
    const cells: Record<string, HTMLElement[]> = {};
    for (const key of ['a', 'b', 'd']) {
      cells[key] = [0, 1].map((index) => {
        const cell = document.createElement('div');
        cell.dataset.ssgColKey = key;
        if (options.header && index === 0) {
          cell.className = 'ssg-header-cell';
          cell.innerHTML =
            `<div class="ssg-header-label" data-ssg-tooltip="${key}">${key.toUpperCase()}</div>` +
            '<div class="ssg-header-actions"><span class="ssg-header-grip" data-ssg-tooltip="ドラッグで列を移動"></span></div>';
        }
        container.appendChild(cell);
        return cell;
      });
    }
    if (options.attach !== false) document.body.appendChild(container);
    return cells;
  };
  const floatLayer = () => document.querySelector<HTMLElement>('.ssg-col-drag-float');
  const floatColumn = () => floatLayer()?.firstElementChild as HTMLElement | undefined;

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

  // 変更(M-12 D): 別ペインへ移すときは、ゴーストではなく浮かぶ列(列の複製)がポインタに付いてきて、元のペインは詰まり、
  //   移動先は縦線で示す。浮かぶ列の見出しにはゴーストと同じアイコン(固定ペインへはピン / 中央へは移動の矢印)。
  const PIN_PATH = 'M5 17h14';
  const MOVE_POLYLINE = 'polyline';

  it("motion='live': 別ペイン(空の左固定ペイン帯)では浮かぶ列 + 縦線 + ピンになり、元のペインは詰まり、Esc で元へ戻る", () => {
    vi.useFakeTimers();
    try {
      const controller = createColumnHeaderDragController<Row>();
      const args = makeArgs();
      const cells = mountCells(args.scrollContainerRef.current!, { header: true });
      // 本物の縦線(左固定ペインの中)の矩形。浮かぶ列の上へ同じ矩形で写る。
      args.leftIndicatorRef.current!.getBoundingClientRect = () => makeRect(1, -20, 2, 500);
      controller.update({
        ...args,
        leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
        motion: 'live',
      });

      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 280, 10);
      expect(cells.d[0].style.transform).toBe('translateX(-100px)');

      // x=10 は空の左固定ペインのドロップ帯 → 縦線 + 浮かぶ列(ゴーストは出さない)。
      dispatchPointer('pointermove', 1, 10, 10);
      expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
      expect(args.leftIndicatorRef.current?.style.display).toBe('block');
      // 掴んだ列(本物)は基準位置で隠れ、元のペインの後ろの列(b / d)が a の幅ぶん左へ詰まる。
      for (const cell of cells.a) {
        expect(cell.style.visibility).toBe('hidden');
        expect(cell.style.transform).toBe('translateX(0px)');
        expect(cell.hasAttribute('data-ssg-col-dragging')).toBe(false);
      }
      expect(cells.b[0].style.transform).toBe('translateX(-100px)');
      expect(cells.d[1].style.transform).toBe('translateX(-100px)');

      // 浮かぶ列はシェル(スクロールコンテナの親)直下のクリップ層に置かれ、操作を受けない。
      const layer = floatLayer();
      expect(layer).not.toBeNull();
      expect(layer!.parentElement).toBe(args.scrollContainerRef.current!.parentElement);
      expect(layer!.style.pointerEvents).toBe('none');
      expect(layer!.style.overflow).toBe('hidden');
      expect(layer!.getAttribute('aria-hidden')).toBe('true');
      expect(layer!.hasAttribute('inert')).toBe(true);
      // 複製は掴んだ列のセル 2 枚。列キー / ツールチップ / 見出しの操作群は持たず、浮いた見た目(live 属性)で表示される。
      const clones = layer!.querySelectorAll<HTMLElement>('[data-ssg-col-dragging="live"]');
      expect(clones).toHaveLength(2);
      expect(layer!.querySelector('[data-ssg-col-key]')).toBeNull();
      expect(layer!.querySelector('[data-ssg-tooltip]')).toBeNull();
      expect(layer!.querySelector('.ssg-header-actions')).toBeNull();
      for (const clone of clones) expect(clone.style.visibility).toBe('');
      // 見出しの先頭にピンのアイコン。見出しは本体セルより前面。
      const header = layer!.querySelector<HTMLElement>('.ssg-header-cell');
      expect(header?.firstElementChild?.className).toBe('ssg-col-drag-pin');
      expect(header?.firstElementChild?.innerHTML).toContain(PIN_PATH);
      expect(header?.style.zIndex).toBe('1');
      // 位置はポインタ基準(掴んだ点は列の左端から 40px = 押下 x=40 / 列 left=0)。10 - 40 = -30 は表の枠(クリップ層の
      //   left=0)の外になるため、枠の内側(0)で止まる。
      expect(floatColumn()?.style.transform).toBe('translateX(0px)');
      // 縦線は浮かぶ列の上(クリップ層の最後の子)へ、本物と同じクラス・同じ矩形で写る。
      const guide = layer!.lastElementChild as HTMLElement;
      expect(guide.className).toBe('ssg-col-drop-indicator');
      expect(guide.style.display).toBe('block');
      expect(guide.style.left).toBe('1px');
      expect(guide.style.top).toBe('-20px');
      expect(guide.style.height).toBe('500px');

      // 中央へ戻ると浮かぶ列が消え、本物が再表示されて追従に戻る。
      dispatchPointer('pointermove', 1, 280, 10);
      expect(floatLayer()).toBeNull();
      expect(cells.a[0].style.visibility).toBe('');
      expect(cells.a[0].style.transform).toBe('translateX(240px)');
      expect(cells.a[0].getAttribute('data-ssg-col-dragging')).toBe('live');

      // もう一度左へ出してから Escape: commit せず、浮かぶ列を元の位置へ滑らせ、戻り切ってから外して本物を表示する。
      dispatchPointer('pointermove', 1, 10, 10);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();
      expect(document.body.style.cursor).toBe('');
      expect(args.leftIndicatorRef.current?.style.display).toBe('none');
      expect((floatLayer()?.lastElementChild as HTMLElement | null)?.style.display).toBe('none');
      expect(floatColumn()?.style.transform).toBe('translateX(0px)');
      expect(floatColumn()?.style.transition).toContain('transform');
      expect(floatLayer()?.querySelector('.ssg-col-drag-pin')).toBeNull();
      expect(cells.a[0].style.visibility).toBe('hidden');
      expect(cells.d[0].style.transform).toBe('translateX(0px)');
      vi.advanceTimersByTime(300);
      expect(floatLayer()).toBeNull();
      expect(cells.a[0].style.visibility).toBe('');
      expect(cells.a[0].style.transform).toBe('');
      expect(cells.a[0].style.zIndex).toBe('');
      expect(cells.d[0].style.transition).toBe('');
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("motion='live': 別ペインへ離すと pin 付きで commit し、浮かぶ列が新しい位置の列へ滑り込んでから外れる", () => {
    vi.useFakeTimers();
    try {
      const controller = createColumnHeaderDragController<Row>();
      const args = makeArgs();
      const cells = mountCells(args.scrollContainerRef.current!, { header: true });
      controller.update({
        ...args,
        leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
        motion: 'live',
      });

      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 10, 10);
      dispatchPointer('pointerup', 1, 10, 10);
      expect(args.applyColumnOrderAndPin).toHaveBeenCalledTimes(1);
      expect(args.applyColumnOrderAndPin.mock.calls[0][0]).toEqual(['a', 'b', 'c', 'd']);
      expect(args.applyColumnOrderAndPin.mock.calls[0][1]).toEqual(new Map([['a', 'left']]));
      // 確定直後: 本物の inline style は外し(描き直しは利用側の columns 差し替え)、浮かぶ列はアイコンを外して残す。
      expect(cells.a[0].style.visibility).toBe('');
      expect(cells.b[0].style.transform).toBe('');
      expect(floatLayer()).not.toBeNull();
      expect(floatLayer()!.querySelector('.ssg-col-drag-pin')).toBeNull();
      expect((floatLayer()!.lastElementChild as HTMLElement).style.display).toBe('none');

      // 確定とは別の描き直し(まだ a が左固定ペインに無い)では待ち続ける(元の位置へ滑らせない)。
      for (const cell of cells.a) cell.getBoundingClientRect = () => makeRect(120, 0, 100, 30);
      controller.applyReorderSettle();
      for (const cell of cells.a) expect(cell.style.visibility).toBe('');
      expect(floatColumn()?.style.transition).toBe('none');

      // 確定後の描画(applyReorderSettle): 新しい位置の列を隠し、浮かぶ列をその左端(x=120)へ滑らせる。
      const pinnedA: GridColumn<Row> = { ...columns[0], pinned: 'left' };
      controller.update({
        ...args,
        columns: [pinnedA, ...columns.slice(1)],
        paneLayout: {
          ...paneLayout,
          left: {
            pane: 'left',
            entries: [{ column: pinnedA, logicalIndex: 0, paneLocalStart: 0, paneLocalSize: 100, paneLocalEnd: 100 }],
            totalWidth: 100,
          },
        },
        leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 100, 300)) },
        motion: 'live',
      });
      controller.applyReorderSettle();
      for (const cell of cells.a) expect(cell.style.visibility).toBe('hidden');
      expect(floatColumn()?.style.transform).toBe('translateX(120px)');
      expect(floatColumn()?.style.transition).toContain('180ms');
      // 2 回目の applyReorderSettle(別の描き直し)では何もしない。
      controller.applyReorderSettle();
      expect(floatColumn()?.style.transform).toBe('translateX(120px)');

      vi.advanceTimersByTime(250);
      expect(floatLayer()).toBeNull();
      for (const cell of cells.a) expect(cell.style.visibility).toBe('');
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("motion='live': 確定後に描き直しが来ない(利用側が columns を差し替えない)ときも浮かぶ列は猶予後に外れる", () => {
    vi.useFakeTimers();
    try {
      const controller = createColumnHeaderDragController<Row>();
      const args = makeArgs();
      mountCells(args.scrollContainerRef.current!, { header: true });
      controller.update({
        ...args,
        leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
        motion: 'live',
      });
      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 10, 10);
      dispatchPointer('pointerup', 1, 10, 10);
      expect(floatLayer()).not.toBeNull();
      vi.advanceTimersByTime(399);
      expect(floatLayer()).not.toBeNull();
      vi.advanceTimersByTime(2);
      expect(floatLayer()).toBeNull();
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("motion='live': 浮かぶ列は表の枠の右端でも内側で止まる", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const cells = mountCells(args.scrollContainerRef.current!, { header: true });
    // 掴む列 a は幅 100(left=0)。押下 x=40 → 掴んだ点は列の左端から 40px。
    for (const cell of cells.a) cell.getBoundingClientRect = () => makeRect(0, 0, 100, 30);
    controller.update({
      ...args,
      rightPaneScrollRef: { current: makeElement(makeRect(400, 0, 0, 300)) },
      motion: 'live',
    });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    // x=390 は空の右固定ペインのドロップ帯。ポインタ基準なら 350 だが、枠(幅 400)の内側 = 400 - 100 = 300 で止まる。
    dispatchPointer('pointermove', 1, 390, 10);
    expect(args.rightIndicatorRef.current?.style.display).toBe('block');
    expect(floatColumn()?.style.transform).toBe('translateX(300px)');
    const badge = floatLayer()?.querySelector('.ssg-col-drag-pin');
    expect(badge?.innerHTML).toContain(PIN_PATH);
    controller.dispose();
    expect(floatLayer()).toBeNull();
  });

  it("motion='live': 固定ペインから中央へ運ぶときは見出しのアイコンが移動の矢印になり、左固定ペインは詰まる", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const cells = mountCells(args.scrollContainerRef.current!, { header: true });
    const pinnedColumns: GridColumn<Row>[] = [{ ...columns[0], pinned: 'left' }, ...columns.slice(1)];
    const entry = (column: GridColumn<Row>, index: number) => ({
      column,
      logicalIndex: index,
      paneLocalStart: index * 100,
      paneLocalSize: 100,
      paneLocalEnd: index * 100 + 100,
    });
    controller.update({
      ...args,
      columns: pinnedColumns,
      paneLayout: {
        left: { pane: 'left', entries: [entry(pinnedColumns[0], 0)], totalWidth: 100 },
        center: { pane: 'center', entries: [entry(pinnedColumns[1], 0), entry(pinnedColumns[3], 1)], totalWidth: 200 },
        right: emptyPane('right'),
      },
      leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 100, 300)) },
      bodyScrollRef: { current: makeElement(makeRect(100, 0, 300, 300)) },
      motion: 'live',
    });

    controller.onColumnDragHandlePointerDown(pinnedColumns[0], gripEvent());
    // x=260 は中央ペインのローカル 160 = d(100..200)の後半 = slot 2(末尾)。
    args.centerIndicatorRef.current!.getBoundingClientRect = () => makeRect(299, 0, 2, 300);
    dispatchPointer('pointermove', 1, 260, 10);
    expect(args.centerIndicatorRef.current?.style.display).toBe('block');
    // 枠の内側なのでポインタ基準のまま(260 - 40)。縦線は中央の見える範囲(左固定ペインの右端 100 より右)なので写す。
    expect(floatColumn()?.style.transform).toBe('translateX(220px)');
    const guide = floatLayer()!.lastElementChild as HTMLElement;
    expect(guide.style.display).toBe('block');
    expect(guide.style.left).toBe('299px');
    // 中央の縦線が左固定ペインの下に潜る位置(横スクロールで隠れた境界)では写さない(本物も見えないため)。
    args.centerIndicatorRef.current!.getBoundingClientRect = () => makeRect(59, 0, 2, 300);
    dispatchPointer('pointermove', 1, 262, 10);
    expect(guide.style.display).toBe('none');
    args.centerIndicatorRef.current!.getBoundingClientRect = () => makeRect(299, 0, 2, 300);
    dispatchPointer('pointermove', 1, 260, 10);
    expect(guide.style.display).toBe('block');
    const badge = floatLayer()?.querySelector('.ssg-col-drag-pin');
    expect(badge?.innerHTML).toContain(MOVE_POLYLINE);
    expect(badge?.innerHTML).not.toContain(PIN_PATH);
    expect(cells.a[0].style.visibility).toBe('hidden');
    // 中央の列は退避しない(縦線だけ)。
    expect(cells.b[0].style.transform).toBe('');
    dispatchPointer('pointerup', 1, 260, 10);
    expect(args.applyColumnOrderAndPin.mock.calls[0][0]).toEqual(['b', 'c', 'd', 'a']);
    expect(args.applyColumnOrderAndPin.mock.calls[0][1]).toEqual(new Map([['a', undefined]]));
    controller.dispose();
    expect(floatLayer()).toBeNull();
  });

  it("motion='live': 縦スクロールや描画中のセル数が変わると浮かぶ列を複製し直し、dispose で外す", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const container = args.scrollContainerRef.current!;
    const cells = mountCells(container, { header: true });
    controller.update({
      ...args,
      leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
      motion: 'live',
    });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 10, 10);
    const firstClone = floatColumn()?.firstElementChild;
    expect(firstClone).not.toBeNull();

    // 同じ状態のまま動かしても複製は作り直さない。
    dispatchPointer('pointermove', 1, 12, 10);
    expect(floatColumn()?.firstElementChild).toBe(firstClone);

    // 縦スクロールしたら作り直す。
    Object.defineProperty(container, 'scrollTop', { value: 60, configurable: true });
    dispatchPointer('pointermove', 1, 14, 10);
    expect(floatColumn()?.firstElementChild).not.toBe(firstClone);

    // 仮想化で掴んだ列のセルが増えたら取り込む(本物は隠す)。
    const added = document.createElement('div');
    added.dataset.ssgColKey = 'a';
    container.appendChild(added);
    dispatchPointer('pointermove', 1, 16, 10);
    expect(floatColumn()?.children).toHaveLength(3);
    expect(added.style.visibility).toBe('hidden');
    expect(cells.a[0].style.visibility).toBe('hidden');

    // ドラッグ中の dispose で浮かぶ列も外れ、本物の inline style も戻る。
    controller.dispose();
    expect(floatLayer()).toBeNull();
    expect(cells.a[0].style.visibility).toBe('');
    expect(added.style.visibility).toBe('');
  });

  it("motion='live': 浮かぶ列を置けない(シェルが無い)ときは従来どおりゴースト + 縦線で、列は基準位置へ戻る", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const cells = mountCells(args.scrollContainerRef.current!, { attach: false });
    controller.update({
      ...args,
      leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
      motion: 'live',
    });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 280, 10);
    dispatchPointer('pointermove', 1, 10, 10);
    expect(document.querySelector('[data-grid-drag-ghost]')?.textContent).toBe('A');
    expect(floatLayer()).toBeNull();
    expect(args.leftIndicatorRef.current?.style.display).toBe('block');
    expect(cells.a[0].style.transform).toBe('translateX(0px)');
    expect(cells.a[0].style.visibility).toBe('');
    expect(cells.d[0].style.transform).toBe('translateX(0px)');
    dispatchPointer('pointerup', 1, 10, 10);
    expect(args.applyColumnOrderAndPin.mock.calls[0][1]).toEqual(new Map([['a', 'left']]));
    controller.dispose();
  });

  it("motion='live': キャンセルで戻している最中に次のドラッグを始めると、浮かぶ列はすぐ外れて隠していた列も表示される", () => {
    vi.useFakeTimers();
    try {
      const controller = createColumnHeaderDragController<Row>();
      const args = makeArgs();
      const cells = mountCells(args.scrollContainerRef.current!, { header: true });
      controller.update({
        ...args,
        leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
        motion: 'live',
      });
      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 10, 10);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(floatLayer()).not.toBeNull();
      expect(cells.a[0].style.visibility).toBe('hidden');

      // 戻り切る前に b を掴む。
      controller.onColumnDragHandlePointerDown(columns[1], gripEvent({ clientX: 140 }));
      expect(floatLayer()).toBeNull();
      expect(cells.a[0].style.visibility).toBe('');
      vi.advanceTimersByTime(300);
      expect(cells.a[0].style.visibility).toBe('');
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  // 修正(M-12 D 見直し)。
  it("motion='live': ドラッグ中に 2 本目のポインタで grip を押しても始めず、同じポインタなら前のドラッグを取り消して始め直す", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const cells = mountCells(args.scrollContainerRef.current!, { header: true });
    controller.update({
      ...args,
      leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
      motion: 'live',
    });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 10, 10);
    expect(cells.a[0].style.visibility).toBe('hidden');

    // 2 本目(pointerId 2)は無視: 1 本目の状態(浮かぶ列 / 隠した列)はそのまま。
    controller.onColumnDragHandlePointerDown(columns[1], gripEvent({ pointerId: 2, clientX: 140 }));
    expect(floatLayer()).not.toBeNull();
    expect(cells.a[0].style.visibility).toBe('hidden');
    dispatchPointer('pointerup', 2, 140, 10);
    expect(args.applyColumnOrderAndPin).not.toHaveBeenCalled();
    dispatchPointer('pointerup', 1, 10, 10);
    expect(args.applyColumnOrderAndPin).toHaveBeenCalledTimes(1);
    expect(args.applyColumnOrderAndPin.mock.calls[0][1]).toEqual(new Map([['a', 'left']]));

    // 同じポインタの pointerdown が来た(pointerup を取りこぼした)ときは、前のドラッグを確定せずに取り消して始め直す。
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 10, 10);
    controller.onColumnDragHandlePointerDown(columns[1], gripEvent({ clientX: 140 }));
    expect(args.applyColumnOrderAndPin).toHaveBeenCalledTimes(1);
    expect(floatLayer()).toBeNull();
    expect(cells.a[0].style.visibility).toBe('');
    dispatchPointer('pointerup', 1, 140, 10);
    controller.dispose();
  });

  it("motion='live': ドラッグ中に新しく描画されたセルは退避先へ transition なしで置く(滑り込んで見えない)", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const container = args.scrollContainerRef.current!;
    const cells = mountCells(container);
    controller.update({ ...args, motion: 'live' });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 280, 10);
    expect(cells.d[0].style.transition).toContain('transform');
    // 縦スクロールで d の行が 1 つ描画された。
    const added = document.createElement('div');
    added.dataset.ssgColKey = 'd';
    container.appendChild(added);
    dispatchPointer('pointermove', 1, 282, 10);
    expect(added.style.transform).toBe('translateX(-100px)');
    expect(added.style.transition).toBe('none');
    controller.dispose();
  });

  it("motion='live': 掴んだ列が描画されていないまま同じペインへ戻ったときは浮かぶ列が代わりに追従し、離すと片付く", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const container = args.scrollContainerRef.current!;
    const cells = mountCells(container, { header: true });
    controller.update({
      ...args,
      leftPaneScrollRef: { current: makeElement(makeRect(0, 0, 0, 300)) },
      motion: 'live',
    });
    controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
    dispatchPointer('pointermove', 1, 10, 10);
    expect(floatLayer()).not.toBeNull();
    // 端の autoscroll で元の位置が横の仮想化で外れた(a のセルが外れた)。
    for (const cell of cells.a) cell.remove();
    dispatchPointer('pointermove', 1, 280, 10);
    expect(args.leftIndicatorRef.current?.style.display).toBe('none');
    expect(floatLayer()).not.toBeNull();
    expect(floatColumn()?.style.transform).toBe('translateX(240px)');
    const badge = floatLayer()!.querySelector<HTMLElement>('.ssg-col-drag-pin');
    expect(badge?.style.display).toBe('none');
    expect((floatLayer()!.lastElementChild as HTMLElement).style.display).toBe('none');
    // 退避は同じペインの追従と同じ(b / d が左へ)。
    expect(cells.b[0].style.transform).toBe('translateX(-100px)');
    dispatchPointer('pointerup', 1, 280, 10);
    expect(args.applyColumnOrderAndPin.mock.calls[0][0]).toEqual(['b', 'c', 'd', 'a']);
    expect(floatLayer()).not.toBeNull();
    // 確定後の描画で a が描画されていなければ、滑らせずに片付ける。
    controller.applyReorderSettle();
    expect(floatLayer()).toBeNull();
    controller.dispose();
  });

  it("motion='live': 動いている最中の列を掴んでも、掴んだ点は transform を除いた基準位置から測る", () => {
    const controller = createColumnHeaderDragController<Row>();
    const args = makeArgs();
    const cells = mountCells(args.scrollContainerRef.current!, { header: true });
    // a の見出しは基準位置 0 から +30px 動いている途中(画面上の左端 30)。
    cells.a[0].getBoundingClientRect = () => makeRect(30, 0, 100, 30);
    const original = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) =>
        el === cells.a[0] ? ({ transform: 'matrix(1, 0, 0, 1, 30, 0)' } as CSSStyleDeclaration) : original(el, pseudo),
      );
    try {
      controller.update({
        ...args,
        rightPaneScrollRef: { current: makeElement(makeRect(400, 0, 0, 300)) },
        motion: 'live',
      });
      // 押下 x=70 → 基準位置の左端 0 から 70px(画面上の左端 30 から測ると 40px になってずれる)。
      controller.onColumnDragHandlePointerDown(columns[0], gripEvent({ clientX: 70 }));
      dispatchPointer('pointermove', 1, 390, 10);
      expect(floatColumn()?.style.transform).toBe('translateX(300px)');
      controller.dispose();
    } finally {
      spy.mockRestore();
    }
  });

  it('確定後のスライド(FLIP)の途中で次のドラッグを始めると、スライドの後始末をその場で済ませる', () => {
    vi.useFakeTimers();
    try {
      const controller = createColumnHeaderDragController<Row>();
      const args = makeArgs();
      const cells = mountCells(args.scrollContainerRef.current!);
      controller.update(args);
      // ghost 方式で a を末尾へ。確定前の b の左端 100 → 確定後 0(FLIP で 100px ぶん戻して見せてから滑らせる)。
      for (const cell of cells.b) cell.getBoundingClientRect = () => makeRect(100, 0, 100, 30);
      controller.onColumnDragHandlePointerDown(columns[0], gripEvent());
      dispatchPointer('pointermove', 1, 280, 10);
      dispatchPointer('pointerup', 1, 280, 10);
      for (const cell of cells.b) cell.getBoundingClientRect = () => makeRect(0, 0, 100, 30);
      controller.applyReorderSettle();
      expect(cells.b[0].style.transform).toBe('translateX(0)');
      expect(cells.b[0].style.transition).toContain('transform');

      controller.onColumnDragHandlePointerDown(columns[3], gripEvent({ clientX: 240 }));
      expect(cells.b[0].style.transform).toBe('');
      expect(cells.b[0].style.transition).toBe('');
      dispatchPointer('pointerup', 1, 240, 10);
      vi.advanceTimersByTime(400);
      expect(cells.b[0].style.transform).toBe('');
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