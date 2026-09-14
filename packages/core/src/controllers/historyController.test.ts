// 追加(非依存化 ③-5): historyController のテストです(React 非依存で update / メソッドを直接呼ぶ)。
import { describe, expect, it, vi } from 'vitest';
import { createHistoryController, type HistoryControllerArgs } from './historyController';
import type { GridUiAction } from '../model/gridActions';
import type { CellCoord, UndoRedoState } from '../model/gridTypes.core';

type Row = { id: number };

const makeArgs = (overrides: Partial<HistoryControllerArgs<Row>> = {}) => {
  const onRowsChange = vi.fn<(rows: Row[]) => void>();
  const dispatch = vi.fn<(action: GridUiAction) => void>();
  const onUndoRedoStateChange = vi.fn<(state: UndoRedoState) => void>();
  const onAfterRestore = vi.fn<(cell: CellCoord | null) => void>();
  const args: HistoryControllerArgs<Row> = {
    rows: [{ id: 1 }],
    selection: null,
    activeCell: { row: 0, col: 0 },
    onRowsChange,
    dispatch,
    enabled: true,
    limit: 10,
    onUndoRedoStateChange,
    onAfterRestore,
    ...overrides,
  };
  return { args, onRowsChange, dispatch, onUndoRedoStateChange, onAfterRestore };
};

describe('historyController', () => {
  it('handleRowsChange で積み、undo / redo で rows と UI を復元、自己発行 rows はリセットしない', () => {
    const c = createHistoryController<Row>();
    const t = makeArgs();
    c.update(t.args);
    expect(c.canUndo()).toBe(false);
    const rows2 = [{ id: 2 }];
    c.handleRowsChange(rows2);
    expect(t.onRowsChange).toHaveBeenLastCalledWith(rows2);
    expect(t.onUndoRedoStateChange).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
    c.update({ ...t.args, rows: rows2, activeCell: { row: 1, col: 1 } });
    expect(c.canUndo()).toBe(true);

    c.undo();
    expect(t.onRowsChange).toHaveBeenLastCalledWith(t.args.rows);
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual([
      'selection/clear',
      'cell/activate',
    ]);
    expect(t.onAfterRestore).toHaveBeenLastCalledWith({ row: 0, col: 0 });
    c.update({ ...t.args, rows: t.args.rows });
    expect(c.canUndo()).toBe(false);
    expect(c.canRedo()).toBe(true);
    c.redo();
    expect(t.onRowsChange).toHaveBeenLastCalledWith(rows2);
  });

  it('外部からの rows 差し替えで履歴をリセットし、状態が変わったときだけ通知する', () => {
    const c = createHistoryController<Row>();
    const t = makeArgs();
    c.update(t.args);
    expect(t.onUndoRedoStateChange).not.toHaveBeenCalled();
    c.handleRowsChange([{ id: 2 }]);
    expect(t.onUndoRedoStateChange).toHaveBeenCalledTimes(1);
    const external = [{ id: 3 }];
    c.update({ ...t.args, rows: external });
    expect(t.onUndoRedoStateChange).toHaveBeenCalledTimes(2);
    expect(t.onUndoRedoStateChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: false });
    // 同じ rows 参照での update / 状態不変の再差し替えは通知しない。
    c.update({ ...t.args, rows: external });
    c.update({ ...t.args, rows: [{ id: 4 }] });
    expect(t.onUndoRedoStateChange).toHaveBeenCalledTimes(2);
  });

  it('無効 / onRowsChange なし / update 前は no-op、clearHistory で消える', () => {
    const c = createHistoryController<Row>();
    c.handleRowsChange([{ id: 2 }]);
    c.undo();
    expect(c.canUndo()).toBe(false);

    const disabled = makeArgs({ enabled: false });
    c.update(disabled.args);
    c.handleRowsChange([{ id: 2 }]);
    expect(disabled.onRowsChange).toHaveBeenCalledTimes(1);
    expect(c.canUndo()).toBe(false);

    const noHandler = makeArgs({ onRowsChange: undefined });
    c.update(noHandler.args);
    c.handleRowsChange([{ id: 2 }]);
    expect(c.canUndo()).toBe(false);

    const active = makeArgs();
    c.update(active.args);
    c.handleRowsChange([{ id: 5 }]);
    expect(c.canUndo()).toBe(true);
    c.clearHistory();
    expect(c.canUndo()).toBe(false);
    expect(active.onUndoRedoStateChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: false });
  });
});