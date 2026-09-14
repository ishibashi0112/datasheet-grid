// 追加(非依存化 ③-5): useGridHistoryController の特性テストです(抽出前に現状の挙動を固定)。
//   hook を renderHook で直叩きし、rows の履歴化 / undo・redo / 外部 rows 差し替えでのリセット /
//   通知の抑止 / 無効時の no-op を検証します。
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useGridHistoryController } from './useGridHistoryController';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/model/gridActions';
import type { CellCoord, GridSelection, UndoRedoState } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { id: number };

type Props = {
  rows: Row[];
  selection: GridSelection;
  activeCell: CellCoord | null;
  onRowsChange?: (next: Row[]) => void;
  enabled: boolean;
  limit: number;
  onUndoRedoStateChange?: (state: UndoRedoState) => void;
  onAfterRestore?: (cell: CellCoord | null) => void;
};

const setup = (initial: Partial<Props> = {}) => {
  const dispatch = vi.fn<(action: GridUiAction) => void>();
  const onRowsChange = vi.fn();
  const onUndoRedoStateChange = vi.fn();
  const onAfterRestore = vi.fn();
  const props: Props = {
    rows: [{ id: 1 }],
    selection: null,
    activeCell: { row: 0, col: 0 },
    onRowsChange,
    enabled: true,
    limit: 10,
    onUndoRedoStateChange,
    onAfterRestore,
    ...initial,
  };
  const view = renderHook(
    (p: Props) => useGridHistoryController<Row>({ ...p, dispatch }),
    { initialProps: props },
  );
  return { ...view, props, dispatch, onRowsChange, onUndoRedoStateChange, onAfterRestore };
};

describe('useGridHistoryController(特性テスト)', () => {
  it('handleRowsChange が履歴を積み、undo / redo で rows と UI スナップショットを復元する', () => {
    const t = setup();
    expect(t.result.current.canUndo()).toBe(false);
    const rows1 = t.props.rows;
    const rows2 = [{ id: 2 }];
    act(() => {
      t.result.current.handleRowsChange?.(rows2);
    });
    expect(t.onRowsChange).toHaveBeenLastCalledWith(rows2);
    // 自己発行した rows が親から戻ってきても履歴はリセットされない。
    t.rerender({ ...t.props, rows: rows2, activeCell: { row: 1, col: 1 } });
    expect(t.result.current.canUndo()).toBe(true);
    expect(t.result.current.canRedo()).toBe(false);

    act(() => {
      t.result.current.undo();
    });
    expect(t.onRowsChange).toHaveBeenLastCalledWith(rows1);
    // 選択なし → clearSelection + activateCell(スナップショットの activeCell)。
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual([
      'selection/clear',
      'cell/activate',
    ]);
    expect(t.onAfterRestore).toHaveBeenLastCalledWith({ row: 0, col: 0 });
    t.rerender({ ...t.props, rows: rows1 });
    expect(t.result.current.canUndo()).toBe(false);
    expect(t.result.current.canRedo()).toBe(true);

    act(() => {
      t.result.current.redo();
    });
    expect(t.onRowsChange).toHaveBeenLastCalledWith(rows2);
    t.rerender({ ...t.props, rows: rows2 });
    expect(t.result.current.canUndo()).toBe(true);
    expect(t.result.current.canRedo()).toBe(false);
  });

  it('外部からの rows 差し替え(自己発行でない)で履歴がリセットされ、状態変化だけ通知される', () => {
    const t = setup();
    // 初期状態(false/false)は「変化なし」扱いで通知しない(現状の契約)。
    expect(t.onUndoRedoStateChange).toHaveBeenCalledTimes(0);
    act(() => {
      t.result.current.handleRowsChange?.([{ id: 2 }]);
    });
    expect(t.onUndoRedoStateChange).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
    const calls = t.onUndoRedoStateChange.mock.calls.length;
    // 同じ状態の再通知はしない。
    t.rerender({ ...t.props, rows: [{ id: 2 }], onUndoRedoStateChange: t.onUndoRedoStateChange });
    // ↑ 自己発行ではない別参照の rows → リセット → false/false を通知。
    expect(t.onUndoRedoStateChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: false });
    expect(t.onUndoRedoStateChange.mock.calls.length).toBe(calls + 1);
    expect(t.result.current.canUndo()).toBe(false);
  });

  it('enabled=false / onRowsChange 未指定では履歴化しない', () => {
    const disabled = setup({ enabled: false });
    act(() => {
      disabled.result.current.handleRowsChange?.([{ id: 9 }]);
    });
    expect(disabled.onRowsChange).toHaveBeenCalledTimes(1);
    expect(disabled.result.current.canUndo()).toBe(false);
    act(() => {
      disabled.result.current.undo();
    });
    expect(disabled.onRowsChange).toHaveBeenCalledTimes(1);

    const noHandler = setup({ onRowsChange: undefined });
    expect(noHandler.result.current.handleRowsChange).toBeUndefined();
    expect(noHandler.result.current.canUndo()).toBe(false);
  });

  it('clearHistory で履歴が消え、limit を超えた分は古い順に捨てられる', () => {
    const t = setup({ limit: 2 });
    for (const id of [2, 3, 4]) {
      const next = [{ id }];
      act(() => {
        t.result.current.handleRowsChange?.(next);
      });
      t.rerender({ ...t.props, rows: next });
    }
    // limit 2 → undo は 2 回まで。
    act(() => {
      t.result.current.undo();
    });
    t.rerender({ ...t.props, rows: t.onRowsChange.mock.calls.at(-1)?.[0] as Row[] });
    act(() => {
      t.result.current.undo();
    });
    t.rerender({ ...t.props, rows: t.onRowsChange.mock.calls.at(-1)?.[0] as Row[] });
    expect(t.result.current.canUndo()).toBe(false);
    expect(t.result.current.canRedo()).toBe(true);
    act(() => {
      t.result.current.clearHistory();
    });
    expect(t.result.current.canRedo()).toBe(false);
  });
});