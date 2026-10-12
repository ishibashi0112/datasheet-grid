// 追加(非依存化 ③-17): ポインタ操作コントローラの単体テストです。auto-scroll / ドラッグ選択の挙動は
//   hooks/useGridPointerInteractions.test.ts(hook 経由)が担うため、ここではコントローラ固有の契約
//   (生成時に window を触らない / update で attach・dispose で detach / タッチのタップ確定と
//   ダブルタップ / Shift+クリックの複数ソート)を検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  createPointerInteractionsController,
  TOUCH_DOUBLE_TAP_MS,
  type GridPointerEventLike,
  type PointerInteractionsArgs,
} from './pointerInteractionsController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn } from '../model/gridTypes.unbound';
import { createUniformRowMetrics } from '../logic/verticalGeometry';
import type { GridPaneLayout } from '../logic/geometry';

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 100 },
  { key: 'name', title: '名前', width: 100 },
];

const paneLayout: GridPaneLayout<Row> = {
  left: { pane: 'left', entries: [], totalWidth: 0 },
  center: {
    pane: 'center',
    entries: columns.map((column, logicalIndex) => ({
      column,
      logicalIndex,
      paneLocalStart: logicalIndex * 100,
      paneLocalSize: 100,
      paneLocalEnd: logicalIndex * 100 + 100,
    })),
    totalWidth: 200,
  },
  right: { pane: 'right', entries: [], totalWidth: 0 },
};

const makeArgs = (
  overrides: Partial<PointerInteractionsArgs<Row>> = {},
): PointerInteractionsArgs<Row> & { actions: GridUiAction[] } => {
  const actions: GridUiAction[] = [];
  return {
    gridRootRef: { current: document.createElement('div') },
    bodyScrollRef: { current: document.createElement('div') },
    scrollContainerRef: { current: document.createElement('div') },
    leftPaneScrollRef: { current: null },
    rightPaneScrollRef: { current: null },
    pointerClientRef: { current: null },
    autoScrollFrameRef: { current: null },
    uiState: createInitialGridUiState(),
    dispatch: (action) => {
      actions.push(action);
    },
    enableRangeSelection: true,
    enableSorting: true,
    orderedColumns: columns,
    filteredRowsLength: 10,
    visibleColumnsLength: 2,
    paneLayout,
    leftLeadingWidth: 0,
    centerLeadingWidth: 0,
    rightLeadingWidth: 0,
    headerHeight: 0,
    rowMetrics: createUniformRowMetrics(10, 10),
    verticalScaleFactor: 1,
    setHoveredRowIndex: () => {},
    setHoveredColumnIndex: () => {},
    enableRowHover: false,
    enableColumnHeaderHover: false,
    enableRowSelection: false,
    onGutterRowSelect: () => {},
    onGutterRowSelectDrag: () => {},
    onCellDoubleClickRef: { current: () => {} },
    actions,
    ...overrides,
  };
};

const pointerEvent = (
  overrides: Partial<GridPointerEventLike> = {},
): GridPointerEventLike => ({
  button: 0,
  pointerType: 'mouse',
  pointerId: 1,
  clientX: 10,
  clientY: 10,
  shiftKey: false,
  preventDefault: () => {},
  ...overrides,
});

const firePointerUp = (init: PointerEventInit & { timeStamp?: number }) => {
  const event = new PointerEvent('pointerup', init);
  if (init.timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: init.timeStamp });
  }
  window.dispatchEvent(event);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pointerInteractionsController', () => {
  it('生成時には window を触らず、update で attach・dispose で detach する', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const controller = createPointerInteractionsController<Row>();
    expect(add).not.toHaveBeenCalled();

    controller.update(makeArgs());
    controller.update(makeArgs());
    const attached = add.mock.calls.map(([type]) => type);
    expect(attached).toEqual(['pointermove', 'pointerup', 'pointercancel']);

    controller.dispose();
    expect(remove.mock.calls.map(([type]) => type)).toEqual([
      'pointermove',
      'pointerup',
      'pointercancel',
    ]);
  });

  it('マウスの pointerdown はセルを活性化し範囲選択を開始、pointerup で終了する', () => {
    const controller = createPointerInteractionsController<Row>();
    const args = makeArgs();
    controller.update(args);
    controller.handleCellPointerDown({ row: 2, col: 1 }, pointerEvent());
    expect(args.actions.map((action) => action.type)).toEqual([
      'cell/activate',
      'selection/start',
    ]);
    expect(args.pointerClientRef.current).toEqual({ x: 10, y: 10 });

    firePointerUp({ pointerId: 1, clientX: 10, clientY: 10 });
    expect(args.actions.map((action) => action.type)).toEqual([
      'cell/activate',
      'selection/start',
      'selection/end',
      'column/resizeEnd',
    ]);
    controller.dispose();
  });

  it('タッチはタップを保留し、動かずに pointerup したら確定、同一セルの連続タップはダブルクリック扱い', () => {
    const controller = createPointerInteractionsController<Row>();
    const onDouble = vi.fn();
    const args = makeArgs({ onCellDoubleClickRef: { current: onDouble } });
    controller.update(args);
    const touch = pointerEvent({ pointerType: 'touch', pointerId: 7 });

    controller.handleCellPointerDown({ row: 1, col: 0 }, touch);
    expect(args.actions).toEqual([]);

    // 10px 以上動いたらタップ不成立。
    firePointerUp({ pointerId: 7, clientX: 30, clientY: 10, timeStamp: 100 });
    expect(args.actions.map((action) => action.type)).toEqual([
      'selection/end',
      'column/resizeEnd',
    ]);
    args.actions.length = 0;

    controller.handleCellPointerDown({ row: 1, col: 0 }, touch);
    firePointerUp({ pointerId: 7, clientX: 12, clientY: 11, timeStamp: 200 });
    expect(args.actions.map((action) => action.type)).toEqual([
      'cell/activate',
      'selection/start',
      'selection/end',
      'selection/end',
      'column/resizeEnd',
    ]);
    expect(onDouble).not.toHaveBeenCalled();

    controller.handleCellPointerDown({ row: 1, col: 0 }, touch);
    firePointerUp({
      pointerId: 7,
      clientX: 10,
      clientY: 10,
      timeStamp: 200 + TOUCH_DOUBLE_TAP_MS - 1,
    });
    // 変更(G-1): ダブルタップを離した pointerup のイベントも渡す(onCellDoubleClick の params.event)。
    expect(onDouble).toHaveBeenCalledWith(
      { row: 1, col: 0 },
      expect.objectContaining({ type: 'pointerup', pointerId: 7 }),
    );
    // タッチ由来の native dblclick は無視する。
    controller.handleCellDoubleClick({ row: 1, col: 0 }, new MouseEvent('dblclick'));
    expect(onDouble).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('列ヘッダーの Shift+クリックは複数ソートをトグルする', () => {
    const controller = createPointerInteractionsController<Row>();
    const args = makeArgs();
    controller.update(args);
    controller.handleColumnHeaderPointerDown(1, pointerEvent({ shiftKey: true }));
    expect(args.actions).toEqual([
      { type: 'sort/set', entries: [{ columnKey: 'name', direction: 'asc' }] },
    ]);

    // 既にソート済みなら desc へ、通常クリックは列選択の開始。
    args.actions.length = 0;
    controller.update({
      ...args,
      uiState: {
        ...args.uiState,
        sort: [{ columnKey: 'name', direction: 'asc' }],
      },
    });
    controller.handleColumnHeaderPointerDown(1, pointerEvent({ shiftKey: true }));
    expect(args.actions).toEqual([
      { type: 'sort/set', entries: [{ columnKey: 'name', direction: 'desc' }] },
    ]);
    args.actions.length = 0;
    controller.handleColumnHeaderPointerDown(0, pointerEvent());
    expect(args.actions.map((action) => action.type)).toEqual([
      'columnSelection/start',
    ]);
    controller.dispose();
  });

  // 追加(motion-5 / M-6): enableColumnHover(クロスヘア)では本体セルのホバーで列もホバー扱いになる。
  it('enableColumnHover のときだけ本体セルのホバーで setHoveredColumnIndex が呼ばれる', () => {
    const setHoveredColumnIndex = vi.fn();
    const controller = createPointerInteractionsController<Row>();
    controller.update(makeArgs({ setHoveredColumnIndex, enableRowHover: true }));
    controller.handleCellPointerEnter({ row: 1, col: 2 }, pointerEvent());
    expect(setHoveredColumnIndex).not.toHaveBeenCalled();
    controller.update(makeArgs({ setHoveredColumnIndex, enableRowHover: true, enableColumnHover: true }));
    controller.handleCellPointerEnter({ row: 1, col: 2 }, pointerEvent());
    expect(setHoveredColumnIndex).toHaveBeenCalledWith(2);
  });

  // 追加(見直し): 合計行(footerHeight)の上のポインタは、本体の見えている最後の行として扱う(裏に隠れた行を選ばない)。
  it('footerHeight があると、合計行の上の clientY を本体の見えている最後の行に詰める(無ければ従来どおり)', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(container, 'clientTop', { value: 0, configurable: true });
    const rect = { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
    const body = container;
    const controller = createPointerInteractionsController<Row>();
    controller.update(
      makeArgs({ scrollContainerRef: { current: container }, bodyScrollRef: { current: body }, filteredRowsLength: 20 }),
    );
    // 行の高さ 10。合計行が無ければ clientY 95 は行 9。
    expect(controller.getCellCoordFromClientPoint(10, 95)?.row).toBe(9);
    controller.update(
      makeArgs({
        scrollContainerRef: { current: container },
        bodyScrollRef: { current: body },
        filteredRowsLength: 20,
        rowMetrics: createUniformRowMetrics(20, 10),
        footerHeight: 30,
      }),
    );
    // 合計行(下端 30px)の上 = 見えている最後の行(行 6)。合計行より上はそのまま。
    expect(controller.getCellCoordFromClientPoint(10, 95)?.row).toBe(6);
    expect(controller.getCellCoordFromClientPoint(10, 45)?.row).toBe(4);
    controller.dispose();
  });
});