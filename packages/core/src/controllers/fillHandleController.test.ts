// 追加(フィルハンドル 1A): フィルハンドルのコントローラ(ドラッグ・Ctrl の入れ替え・Escape / blur / pointerId・
//   ダブルクリック・埋めたあとのボタンでの選び直し・ボタンを消す条件・serverSide)を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFillHandleController,
  type FillHandleControllerArgs,
  type FillHandlePointerEvent,
} from './fillHandleController';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn, GridSelection, RowModel } from '../model/gridTypes.unbound';
import type { FillCellEdit } from '../logic/fillHandle';

type Row = { id: number; no: unknown; name: unknown };

const columns: GridColumn<Row>[] = [
  { key: 'no', width: 50 },
  { key: 'name', width: 50 },
];

const modelOf = (rows: Row[]): RowModel<Row> => ({
  getRowCount: () => rows.length,
  getRow: (index) => rows[index],
  getSourceIndex: (index) => index,
  getRowKey: (index) => rows[index]?.id ?? index,
});

const cellSelection = (startRow: number, startCol: number, endRow: number, endCol: number): GridSelection => ({
  type: 'cell',
  range: { start: { row: startRow, col: startCol }, end: { row: endRow, col: endCol } },
});

// 行 10px / 列 50px のヒットテスト。
const hitTest = (clientX: number, clientY: number) => ({
  row: Math.floor(clientY / 10),
  col: Math.floor(clientX / 50),
});

const makeArgs = (overrides: Partial<FillHandleControllerArgs<Row>> = {}) => {
  const rows: Row[] = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    no: index === 0 ? 1 : index === 1 ? 2 : null,
    name: index === 0 ? 'P-001' : null,
  }));
  const root = document.createElement('div');
  root.tabIndex = 0;
  document.body.appendChild(root);
  const dispatch = vi.fn<(action: GridUiAction) => void>();
  const applyRowsChange = vi.fn<(next: Row[]) => void>();
  const amendRowsChange = vi.fn<(next: Row[]) => void>();
  const args: FillHandleControllerArgs<Row> = {
    enabled: true,
    isServerSide: false,
    rows,
    rowModel: modelOf(rows),
    columns,
    selection: cellSelection(0, 0, 1, 0),
    activeCell: { row: 0, col: 0 },
    editing: false,
    readOnly: false,
    canEditCell: undefined,
    dispatch,
    hitTest,
    scrollContainerRef: { current: null },
    gridRootRef: { current: root },
    applyRowsChange,
    amendRowsChange,
    ...overrides,
  };
  return { args, rows, dispatch, applyRowsChange, amendRowsChange, root };
};

const downEvent = (overrides: Partial<FillHandlePointerEvent> = {}): FillHandlePointerEvent => ({
  button: 0,
  pointerId: 1,
  clientX: 45,
  clientY: 19,
  ctrlKey: false,
  metaKey: false,
  timeStamp: 1000,
  preventDefault: () => {},
  stopPropagation: () => {},
  ...overrides,
});

const dispatchPointer = (
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  init: { ctrlKey?: boolean; timeStamp?: number } = {},
) => {
  const event = new window.PointerEvent(type, {
    pointerId,
    clientX,
    clientY,
    ctrlKey: init.ctrlKey ?? false,
    bubbles: true,
  });
  if (event.pointerId !== pointerId) {
    Object.defineProperty(event, 'pointerId', { value: pointerId });
  }
  if (init.timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: init.timeStamp });
  }
  window.dispatchEvent(event);
};

const actionTypes = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.map(([action]) => (action as GridUiAction).type);

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('fillHandleController: ドラッグ', () => {
  it('下へ引くと連続データで埋め、選択を広げ、ボタンを出す', () => {
    const controller = createFillHandleController<Row>();
    const { args, rows, dispatch, applyRowsChange } = makeArgs();
    controller.update(args);
    controller.handlePointerDown(downEvent());
    expect(controller.getSnapshot()).toMatchObject({ status: 'dragging', target: null, previewText: null });
    expect(controller.getPointerSnapshot()).toEqual({ x: 45, y: 19 });

    // 行 4 まで引く。
    dispatchPointer('pointermove', 1, 45, 45);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'dragging',
      target: { direction: 'down', range: { startRow: 2, endRow: 4, startCol: 0, endCol: 0 } },
      toggled: false,
      previewText: '5',
    });
    dispatchPointer('pointerup', 1, 45, 45);

    expect(applyRowsChange).toHaveBeenCalledTimes(1);
    const next = applyRowsChange.mock.calls[0][0];
    expect(next.map((row) => row.no)).toEqual([1, 2, 3, 4, 5, null, null, null]);
    expect(next[5]).toBe(rows[5]);
    expect(actionTypes(dispatch)).toEqual(['selection/start', 'selection/update', 'selection/end', 'cell/activate']);
    expect(dispatch.mock.calls[0][0]).toEqual({ type: 'selection/start', cell: { row: 0, col: 0 } });
    expect(dispatch.mock.calls[1][0]).toEqual({ type: 'selection/update', cell: { row: 4, col: 0 } });
    expect(dispatch.mock.calls[3][0]).toEqual({ type: 'cell/activate', cell: { row: 0, col: 0 } });
    expect(controller.getSnapshot()).toEqual({
      status: 'filled',
      range: { startRow: 0, endRow: 4, startCol: 0, endCol: 0 },
      kind: 'series',
      seriesAvailable: true,
      menu: null,
    });
    expect(controller.getPointerSnapshot()).toBeNull();
  });

  it('Ctrl を押しながらだと入れ替わり(コピー)、キーだけでも切り替わる', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange } = makeArgs();
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 45, { ctrlKey: true });
    expect(controller.getSnapshot()).toMatchObject({ toggled: true, previewText: '1' });
    // Ctrl を離す(keyup)と元へ。押す(keydown)と入れ替え。
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', ctrlKey: false }));
    expect(controller.getSnapshot()).toMatchObject({ toggled: false, previewText: '5' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
    expect(controller.getSnapshot()).toMatchObject({ toggled: true });
    dispatchPointer('pointerup', 1, 45, 45, { ctrlKey: true });
    expect(applyRowsChange.mock.calls[0][0].map((row) => row.no)).toEqual([1, 2, 1, 2, 1, null, null, null]);
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled', kind: 'copy', seriesAvailable: true });
  });

  it('Escape でやめ、ドラッグ中のキーはグリッドへ流さない', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange, root } = makeArgs();
    const gridKeyDown = vi.fn();
    root.addEventListener('keydown', gridKeyDown);
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 45);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(gridKeyDown).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    dispatchPointer('pointerup', 1, 45, 45);
    expect(applyRowsChange).not.toHaveBeenCalled();
    // 終わったあとのキーは流れる。
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(gridKeyDown).toHaveBeenCalledTimes(1);
  });

  it('別のポインタは無視し、blur / pointercancel でやめる', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange } = makeArgs();
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 2, 45, 75);
    expect(controller.getSnapshot()).toMatchObject({ target: null });
    dispatchPointer('pointerup', 2, 45, 75);
    expect(controller.getSnapshot()).toMatchObject({ status: 'dragging' });
    window.dispatchEvent(new Event('blur'));
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });

    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 45);
    dispatchPointer('pointercancel', 1, 45, 45);
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    expect(applyRowsChange).not.toHaveBeenCalled();
  });

  it('元の範囲の内側で離すと何もしない / 右ボタン・無効・行選択・編集中は始めない', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange } = makeArgs();
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 15);
    dispatchPointer('pointerup', 1, 45, 15);
    expect(applyRowsChange).not.toHaveBeenCalled();

    controller.handlePointerDown(downEvent({ button: 2, timeStamp: 5000 }));
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    controller.update({ ...args, enabled: false });
    controller.handlePointerDown(downEvent({ timeStamp: 6000 }));
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    controller.update({ ...args, selection: { type: 'row', startRow: 0, endRow: 1 } });
    controller.handlePointerDown(downEvent({ timeStamp: 7000 }));
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    controller.update({ ...args, editing: true });
    controller.handlePointerDown(downEvent({ timeStamp: 8000 }));
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('選択が無いときはアクティブセル 1 つを元にする', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange } = makeArgs({ selection: null, activeCell: { row: 0, col: 1 } });
    controller.update(args);
    controller.handlePointerDown(downEvent({ clientX: 95, clientY: 9 }));
    dispatchPointer('pointermove', 1, 95, 25);
    dispatchPointer('pointerup', 1, 95, 25);
    expect(applyRowsChange.mock.calls[0][0].map((row) => row.name).slice(0, 3)).toEqual(['P-001', 'P-002', 'P-003']);
  });

  it('編集できないセルだけなら何も書かず、ボタンも出さない', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange, dispatch } = makeArgs({ canEditCell: () => false });
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 45);
    dispatchPointer('pointerup', 1, 45, 45);
    expect(applyRowsChange).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('ドラッグ中に無効になったらやめ、dispose でリスナーを外す', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange } = makeArgs();
    controller.update(args);
    controller.handlePointerDown(downEvent());
    controller.update({ ...args, enabled: false });
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    controller.update(args);
    controller.handlePointerDown(downEvent({ timeStamp: 9000 }));
    controller.dispose();
    dispatchPointer('pointermove', 1, 45, 45);
    dispatchPointer('pointerup', 1, 45, 45);
    expect(applyRowsChange).not.toHaveBeenCalled();
  });
});

describe('fillHandleController: ダブルクリック', () => {
  it('2 回目の押下が近ければ、隣の列に値が続くところまで下へ埋める', () => {
    const controller = createFillHandleController<Row>();
    const rows: Row[] = Array.from({ length: 6 }, (_, index) => ({
      id: index,
      no: index < 4 ? index + 1 : null,
      name: index === 0 ? 'P-001' : null,
    }));
    const { args, applyRowsChange } = makeArgs({
      rows,
      rowModel: modelOf(rows),
      selection: null,
      activeCell: { row: 0, col: 1 },
    });
    controller.update(args);
    controller.handlePointerDown(downEvent({ clientX: 95, clientY: 9, timeStamp: 1000 }));
    dispatchPointer('pointerup', 1, 95, 9, { timeStamp: 1080 });
    controller.handlePointerDown(downEvent({ clientX: 96, clientY: 9, timeStamp: 1300 }));
    expect(applyRowsChange.mock.calls[0][0].map((row) => row.name)).toEqual([
      'P-001',
      'P-002',
      'P-003',
      'P-004',
      null,
      null,
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'filled',
      range: { startRow: 0, endRow: 3, startCol: 1, endCol: 1 },
    });
  });

  it('間隔が空く / 離れていればダブルクリックにしない', () => {
    const controller = createFillHandleController<Row>();
    const { args, applyRowsChange } = makeArgs({ selection: null, activeCell: { row: 0, col: 1 } });
    controller.update(args);
    controller.handlePointerDown(downEvent({ clientX: 95, clientY: 9, timeStamp: 1000 }));
    dispatchPointer('pointerup', 1, 95, 9, { timeStamp: 1080 });
    controller.handlePointerDown(downEvent({ clientX: 95, clientY: 9, timeStamp: 1700 }));
    expect(controller.getSnapshot()).toMatchObject({ status: 'dragging' });
    dispatchPointer('pointerup', 1, 95, 9, { timeStamp: 1750 });
    controller.handlePointerDown(downEvent({ clientX: 120, clientY: 9, timeStamp: 1800 }));
    expect(controller.getSnapshot()).toMatchObject({ status: 'dragging' });
    dispatchPointer('pointerup', 1, 120, 9, { timeStamp: 1850 });
    expect(applyRowsChange).not.toHaveBeenCalled();
  });
});

describe('fillHandleController: 埋めたあとのボタン', () => {
  const fillDown = () => {
    const controller = createFillHandleController<Row>();
    const made = makeArgs();
    controller.update(made.args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 45);
    dispatchPointer('pointerup', 1, 45, 45);
    const filledRows = made.applyRowsChange.mock.calls[0][0];
    const filledArgs = { ...made.args, rows: filledRows, rowModel: modelOf(filledRows), selection: cellSelection(0, 0, 4, 0) };
    controller.update(filledArgs);
    return { controller, ...made, filledRows, filledArgs };
  };

  it('選び直すと埋める前の rows から作り直して差し替え(履歴は積まない)、もう一度戻せる', () => {
    const { controller, args, amendRowsChange, applyRowsChange, filledArgs } = fillDown();
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled', kind: 'series' });
    controller.toggleMenu({ left: 10, top: 10, bottom: 26 });
    expect(controller.getSnapshot()).toMatchObject({ menu: { left: 10, top: 30 } });
    controller.chooseKind('copy');
    expect(applyRowsChange).toHaveBeenCalledTimes(1);
    const copied = amendRowsChange.mock.calls[0][0];
    expect(copied.map((row) => row.no)).toEqual([1, 2, 1, 2, 1, null, null, null]);
    expect(copied[5]).toBe(args.rows[5]);
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled', kind: 'copy', menu: null });
    // 親がまだ戻していない(前に出した rows のまま)でもボタンは残る。
    controller.update(filledArgs);
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled' });
    controller.update({ ...filledArgs, rows: copied, rowModel: modelOf(copied) });
    controller.chooseKind('series');
    expect(amendRowsChange.mock.calls[1][0].map((row) => row.no)).toEqual([1, 2, 3, 4, 5, null, null, null]);
    // 同じ種類を選んでも何もしない。
    controller.chooseKind('series');
    expect(amendRowsChange).toHaveBeenCalledTimes(2);
  });

  it('選択 / rows / 列の並びが変わる・編集が始まるとボタンを消す(列定義の作り直しでは消さない)', () => {
    const first = fillDown();
    first.controller.update({ ...first.filledArgs, columns: columns.map((column) => ({ ...column })) });
    expect(first.controller.getSnapshot()).toMatchObject({ status: 'filled' });
    first.controller.update({ ...first.filledArgs, selection: cellSelection(2, 1, 2, 1) });
    expect(first.controller.getSnapshot()).toEqual({ status: 'idle' });

    const second = fillDown();
    second.controller.update({ ...second.filledArgs, rows: [...second.filledRows] });
    expect(second.controller.getSnapshot()).toEqual({ status: 'idle' });

    const third = fillDown();
    third.controller.update({ ...third.filledArgs, editing: true });
    expect(third.controller.getSnapshot()).toEqual({ status: 'idle' });

    const fourth = fillDown();
    fourth.controller.update({ ...fourth.filledArgs, columns: [...columns].reverse() });
    expect(fourth.controller.getSnapshot()).toEqual({ status: 'idle' });

    // 消えたあとの選び直しは何もしない。
    fourth.controller.chooseKind('copy');
    expect(fourth.amendRowsChange).not.toHaveBeenCalled();
  });

  it('メニューは Escape / 外側の押下 / スクロールで閉じる(ボタンは残る)', () => {
    const { controller, root } = fillDown();
    const chip = document.createElement('button');
    const panel = document.createElement('div');
    document.body.append(chip, panel);
    controller.chipElement.current = chip;
    controller.menuPanel.current = panel;

    controller.toggleMenu({ left: 10, top: 10, bottom: 26 });
    panel.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(controller.getSnapshot()).toMatchObject({ menu: { top: 30 } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled', menu: null });

    controller.toggleMenu({ left: 10, top: 10, bottom: 26 });
    root.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled', menu: null });

    controller.toggleMenu({ left: 10, top: 10, bottom: 26 });
    window.dispatchEvent(new Event('scroll'));
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled', menu: null });

    // ボタンをもう一度押すと閉じる。
    controller.toggleMenu({ left: 10, top: 10, bottom: 26 });
    controller.toggleMenu({ left: 10, top: 10, bottom: 26 });
    expect(controller.getSnapshot()).toMatchObject({ menu: null });
  });

  it('新しくドラッグを始めるとボタンを消す', () => {
    const { controller } = fillDown();
    controller.handlePointerDown(downEvent({ clientX: 45, clientY: 49, timeStamp: 9000 }));
    expect(controller.getSnapshot()).toMatchObject({ status: 'dragging' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
  });
});

describe('fillHandleController: serverSide', () => {
  it('applyServerSideCellEdits へ渡し、選び直しは行キーが同じときだけ上書きする', () => {
    const controller = createFillHandleController<Row>();
    const applyServerSideCellEdits = vi.fn((edits: FillCellEdit<Row>[]) => edits.length);
    const { args, rows } = makeArgs({
      isServerSide: true,
      applyRowsChange: undefined,
      amendRowsChange: undefined,
      applyServerSideCellEdits,
    });
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 35);
    dispatchPointer('pointerup', 1, 45, 35);
    expect(applyServerSideCellEdits).toHaveBeenCalledTimes(1);
    expect(
      applyServerSideCellEdits.mock.calls[0][0].map((edit) => [edit.viewIndex, edit.value]),
    ).toEqual([
      [2, 3],
      [3, 4],
    ]);
    const filledArgs = { ...args, selection: cellSelection(0, 0, 3, 0) };
    controller.update(filledArgs);
    controller.chooseKind('copy');
    expect(applyServerSideCellEdits).toHaveBeenCalledTimes(2);
    expect(
      applyServerSideCellEdits.mock.calls[1][0].map((edit) => edit.value),
    ).toEqual([1, 2]);

    // 行が入れ替わっていたら(refresh 等)書かずにボタンを消す。
    const shifted = rows.map((row) => ({ ...row, id: row.id + 100 }));
    controller.update({ ...filledArgs, rowModel: modelOf(shifted) });
    controller.chooseKind('series');
    expect(applyServerSideCellEdits).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('表示の条件(viewKey: ソート / フィルター / グループ開閉 / 問い合わせ)が変わればボタンを消す(行キーが位置のままでも別の行へ書かない)', () => {
    const controller = createFillHandleController<Row>();
    const applyServerSideCellEdits = vi.fn((edits: FillCellEdit<Row>[]) => edits.length);
    const sortA = [{ columnKey: 'no', direction: 'asc' }];
    const { args } = makeArgs({
      isServerSide: true,
      applyRowsChange: undefined,
      amendRowsChange: undefined,
      applyServerSideCellEdits,
      viewKey: [sortA, 'query-1'],
    });
    controller.update(args);
    controller.handlePointerDown(downEvent());
    dispatchPointer('pointermove', 1, 45, 35);
    dispatchPointer('pointerup', 1, 45, 35);
    const filledArgs = { ...args, selection: cellSelection(0, 0, 3, 0) };
    controller.update(filledArgs);
    // 同じ値の新しい配列なら残す。
    controller.update({ ...filledArgs, viewKey: [sortA, 'query-1'] });
    expect(controller.getSnapshot()).toMatchObject({ status: 'filled' });
    controller.update({ ...filledArgs, viewKey: [sortA, 'query-2'] });
    expect(controller.getSnapshot()).toEqual({ status: 'idle' });
    controller.chooseKind('copy');
    expect(applyServerSideCellEdits).toHaveBeenCalledTimes(1);
  });
});