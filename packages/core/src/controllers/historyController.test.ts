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

  it('amendRowsChange は直前の変更を差し替え、履歴を積まない(元に戻す 1 回で変更前へ)', () => {
    const c = createHistoryController<Row>();
    const t = makeArgs();
    c.update(t.args);
    const filled = [{ id: 2 }];
    c.handleRowsChange(filled);
    c.update({ ...t.args, rows: filled });
    const amended = [{ id: 3 }];
    c.amendRowsChange(amended);
    expect(t.onRowsChange).toHaveBeenLastCalledWith(amended);
    // 自己発行の rows が戻ってきても履歴はリセットしない。
    c.update({ ...t.args, rows: amended });
    expect(c.canUndo()).toBe(true);
    c.undo();
    expect(t.onRowsChange).toHaveBeenLastCalledWith(t.args.rows);
    c.update({ ...t.args, rows: t.args.rows });
    expect(c.canUndo()).toBe(false);
    c.redo();
    expect(t.onRowsChange).toHaveBeenLastCalledWith(amended);
  });

  it('amendRowsChange は親がまだ rows を戻していなくても差し替える', () => {
    const c = createHistoryController<Row>();
    const t = makeArgs();
    c.update(t.args);
    c.handleRowsChange([{ id: 2 }]);
    const amended = [{ id: 3 }];
    c.amendRowsChange(amended);
    c.update({ ...t.args, rows: amended });
    expect(c.canUndo()).toBe(true);
    // 履歴無効でも onRowsChange へは渡す。
    const d = createHistoryController<Row>();
    const u = makeArgs({ enabled: false });
    d.update(u.args);
    d.amendRowsChange(amended);
    expect(u.onRowsChange).toHaveBeenLastCalledWith(amended);
    expect(d.canUndo()).toBe(false);
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

  // 追加(1.1.0 / AP-14): applyRows の関数の形と undoable: false。
  describe('applyRows', () => {
    type Live = { id: number; price: number; memo: string };
    const makeLive = () => {
      const onRowsChange = vi.fn<(rows: Live[]) => void>();
      const base: HistoryControllerArgs<Live> = {
        rows: [
          { id: 1, price: 10, memo: '' },
          { id: 2, price: 20, memo: '' },
        ],
        selection: null,
        activeCell: null,
        onRowsChange,
        dispatch: vi.fn(),
        enabled: true,
        limit: 10,
        rowKeyGetter: (row) => row.id,
      };
      const c = createHistoryController<Live>();
      c.update(base);
      // 親が受け取った rows をそのまま返す(描き直し = update)。
      const render = () => {
        const last = onRowsChange.mock.calls[onRowsChange.mock.calls.length - 1]?.[0];
        if (last) {
          base.rows = last;
          c.update({ ...base });
        }
        return base.rows;
      };
      return { c, onRowsChange, render, base };
    };
    const tick = (rows: Live[], delta: number) => rows.map((row) => ({ ...row, price: row.price + delta }));

    it('既定は履歴に積む(1.0 と同じ)。関数の形は最後に渡した rows を受け取る', () => {
      const { c, onRowsChange, render, base } = makeLive();
      const first = base.rows;
      c.applyRows((prev) => tick(prev, 1));
      // 描き直す前に続けて呼んでも、前の結果に重ねる。
      c.applyRows((prev) => tick(prev, 1));
      expect(onRowsChange.mock.calls[1]?.[0].map((row) => row.price)).toEqual([12, 22]);
      render();
      expect(c.canUndo()).toBe(true);
      c.undo();
      render();
      c.undo();
      expect(render()).toBe(first);
    });

    it('undoable: false は履歴を消さず積みもせず、元に戻すは編集だけを取り消す(外の更新は残る)', () => {
      const { c, render } = makeLive();
      // グリッドでの編集(memo)。
      const current = render();
      c.handleRowsChange(current.map((row) => (row.id === 1 ? { ...row, memo: 'A' } : row)));
      render();
      // 外からの更新を 3 回。
      for (let index = 0; index < 3; index += 1) {
        c.applyRows((prev) => tick(prev, 1), { undoable: false });
        render();
      }
      expect(c.canUndo()).toBe(true);
      expect(c.canRedo()).toBe(false);
      c.undo();
      expect(render()).toEqual([
        { id: 1, price: 13, memo: '' },
        { id: 2, price: 23, memo: '' },
      ]);
      expect(c.canUndo()).toBe(false);
      // やり直しも、その後の外の更新を残したまま。
      c.applyRows((prev) => tick(prev, 1), { undoable: false });
      render();
      expect(c.canRedo()).toBe(true);
      c.redo();
      expect(render()).toEqual([
        { id: 1, price: 14, memo: 'A' },
        { id: 2, price: 24, memo: '' },
      ]);
    });

    it('undoable: false の後でも、rows を外から差し替えれば履歴は消える(これまでどおり)', () => {
      const { c, render, base } = makeLive();
      c.handleRowsChange(render().map((row) => ({ ...row, memo: 'x' })));
      render();
      c.applyRows((prev) => tick(prev, 1), { undoable: false });
      render();
      c.update({ ...base, rows: tick(base.rows, 5) });
      expect(c.canUndo()).toBe(false);
    });

    // 追加(1.1.0 / AP-14 の見直し)
    it('外からの更新の直後(親が描き直す前)に元に戻しても、その更新は残る', () => {
      const { c, render } = makeLive();
      c.handleRowsChange(render().map((row) => (row.id === 1 ? { ...row, memo: 'A' } : row)));
      render();
      c.applyRows((prev) => tick(prev, 1), { undoable: false });
      c.undo();
      expect(render()).toEqual([
        { id: 1, price: 11, memo: '' },
        { id: 2, price: 21, memo: '' },
      ]);
      c.redo();
      expect(render()).toEqual([
        { id: 1, price: 11, memo: 'A' },
        { id: 2, price: 21, memo: '' },
      ]);
    });

    it('rows の変わらない描き直し(グリッドだけが先に描かれる)でも、関数の形の prev は最後に渡した rows', () => {
      const { c, onRowsChange, base } = makeLive();
      c.applyRows((prev) => tick(prev, 1), { undoable: false });
      c.update({ ...base });
      c.applyRows((prev) => tick(prev, 1), { undoable: false });
      expect(onRowsChange.mock.calls[1]?.[0].map((row) => row.price)).toEqual([12, 22]);
    });

    it('行キーが無い表で行の数が変わる編集は、取り直さずに編集の前の rows を戻す(値が別の行へずれない)', () => {
      const { c, render, base } = makeLive();
      base.rowKeyGetter = undefined;
      c.update({ ...base });
      const before = base.rows;
      c.handleRowsChange(before.filter((row) => row.id !== 1));
      render();
      c.applyRows((prev) => tick(prev, 1), { undoable: false });
      render();
      c.undo();
      expect(render()).toBe(before);
    });

    it('履歴が無効なら onRowsChange へ渡すだけ', () => {
      const { c, onRowsChange, base } = makeLive();
      c.update({ ...base, enabled: false });
      c.applyRows((prev) => tick(prev, 1));
      c.applyRows([], { undoable: false });
      expect(onRowsChange).toHaveBeenCalledTimes(2);
      expect(c.canUndo()).toBe(false);
    });
  });
});