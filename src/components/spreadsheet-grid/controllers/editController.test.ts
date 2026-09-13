// 追加(非依存化 ③-6): editController のテストです(React 非依存で update / メソッドを直接呼ぶ)。
//   hooks/useGridEditController.test.ts(特性テスト)と対になり、こちらは update 前の no-op と
//   rAF 時点で最新 args を使う clamp を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditController, type EditControllerArgs } from './editController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes';

type Row = { id: number; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'qty', title: '数量', width: 80, editor: { type: 'number' } },
];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRow: (i) => rows[i],
  getRowCount: () => rows.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const makeArgs = (rows: Row[], editingCell: { row: number; col: number } | null) => {
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const args: EditControllerArgs<Row> = {
    uiState: { ...createInitialGridUiState(columns), editingCell },
    rows,
    visibleColumns: columns,
    rowModel: makeRowModel(rows),
    setEditorInitialValue: vi.fn(),
    onRowsChange: vi.fn(),
    dispatch,
    gridRootRef: { current: null },
    editorActionGuardRef: { current: false },
  };
  return { args, dispatch };
};

describe('editController', () => {
  it('update 前はすべて no-op', () => {
    const c = createEditController<Row>();
    expect(c.commitEdit('1')).toEqual({ status: 'noop' });
    expect(() => {
      c.cancelEdit();
      c.activateSingleCell({ row: 0, col: 0 });
      c.startEditWithValue({ row: 0, col: 0 }, 'x');
    }).not.toThrow();
  });

  it('commit 後の移動先は rAF 時点の最新 args(行数)で clamp する', () => {
    const c = createEditController<Row>();
    const rows2 = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }];
    const t = makeArgs(rows2, { row: 1, col: 0 });
    c.update(t.args);
    expect(c.commitEdit('3', 'down')).toEqual({ status: 'committed' });
    expect(t.args.editorActionGuardRef.current).toBe(true);
    // rAF までに行が 1 行に減った(rows 差し替え → update)。
    const rows1 = [{ id: 1, qty: 1 }];
    c.update({ ...t.args, rows: rows1, rowModel: makeRowModel(rows1) });
    for (const cb of rafCallbacks) cb(0);
    const activate = t.dispatch.mock.calls.find(([a]) => a.type === 'cell/activate');
    expect(activate?.[0]).toMatchObject({ cell: { row: 0, col: 0 } });
    expect(t.args.editorActionGuardRef.current).toBe(false);
  });

  it('列 / 行が見つからないときは stopEdit だけ行い noop を返す', () => {
    const c = createEditController<Row>();
    const t = makeArgs([{ id: 1, qty: 1 }], { row: 5, col: 0 });
    c.update(t.args);
    expect(c.commitEdit('1')).toEqual({ status: 'noop' });
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['edit/stop']);
    expect(t.args.onRowsChange).not.toHaveBeenCalled();
  });
});