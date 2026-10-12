// 監査 B-11: 同値の action は state をそのまま返す(購読者へ通知しない)ことの契約テスト。
import { describe, it, expect } from 'vitest';
import { gridActions } from './gridActions';
import { createInitialGridUiState, gridUiReducer } from './gridReducer';
import { createGridStore } from './gridStore';
import type { ColumnFilterValue } from './gridTypes.unbound';

describe('gridUiReducer の同値 no-op(監査 B-11)', () => {
  const initial = createInitialGridUiState();

  it('cell/activate: 同じ座標 / null → null は no-op、違う座標は新しい state', () => {
    expect(gridUiReducer(initial, gridActions.activateCell(null))).toBe(initial);
    const s1 = gridUiReducer(initial, gridActions.activateCell({ row: 2, col: 3 }));
    expect(s1).not.toBe(initial);
    expect(s1.activeCell).toEqual({ row: 2, col: 3 });
    // 別オブジェクトでも同じ座標なら参照ごと維持。
    expect(gridUiReducer(s1, gridActions.activateCell({ row: 2, col: 3 }))).toBe(s1);
    expect(gridUiReducer(s1, gridActions.activateCell({ row: 2, col: 4 })).activeCell).toEqual({ row: 2, col: 4 });
    expect(gridUiReducer(s1, gridActions.activateCell(null)).activeCell).toBeNull();
  });

  it('edit/stop: 編集中でなければ no-op', () => {
    expect(gridUiReducer(initial, gridActions.stopEdit())).toBe(initial);
    const editing = gridUiReducer(initial, gridActions.startEdit({ row: 1, col: 1 }));
    const stopped = gridUiReducer(editing, gridActions.stopEdit());
    expect(stopped).not.toBe(editing);
    expect(stopped.editingCell).toBeNull();
    // アクティブセルは編集していたセルのまま(従来どおり)。
    expect(stopped.activeCell).toEqual({ row: 1, col: 1 });
  });

  it('selection/clear: 選択もドラッグも無ければ no-op', () => {
    expect(gridUiReducer(initial, gridActions.clearSelection())).toBe(initial);
    const selecting = gridUiReducer(initial, gridActions.startSelection({ row: 0, col: 0 }));
    const cleared = gridUiReducer(selecting, gridActions.clearSelection());
    expect(cleared.selection).toBeNull();
    expect(cleared.dragState).toBeNull();
    // 選択は無いがドラッグだけ残っている場合も片付ける。
    const dragOnly = { ...initial, dragState: selecting.dragState };
    expect(gridUiReducer(dragOnly, gridActions.clearSelection()).dragState).toBeNull();
  });

  it('filter/setGlobal: 同じ文字列なら no-op', () => {
    expect(gridUiReducer(initial, gridActions.setGlobalFilter(''))).toBe(initial);
    const s1 = gridUiReducer(initial, gridActions.setGlobalFilter('abc'));
    expect(s1.filters.globalText).toBe('abc');
    expect(gridUiReducer(s1, gridActions.setGlobalFilter('abc'))).toBe(s1);
  });

  it('filter/setColumn: 構造が同じ値なら no-op(列フィルターの参照も維持)', () => {
    const value: ColumnFilterValue = { kind: 'set', values: ['a', 'b'] };
    const s1 = gridUiReducer(initial, gridActions.setColumnFilter('c', value));
    expect(s1.filters.columnFilters.c).toBe(value);
    expect(gridUiReducer(s1, gridActions.setColumnFilter('c', value))).toBe(s1);
    expect(gridUiReducer(s1, gridActions.setColumnFilter('c', { kind: 'set', values: ['a', 'b'] }))).toBe(s1);
    // 中身が違えば更新。
    const s2 = gridUiReducer(s1, gridActions.setColumnFilter('c', { kind: 'set', values: ['a'] }));
    expect(s2).not.toBe(s1);
    expect(s2.filters.columnFilters.c).toEqual({ kind: 'set', values: ['a'] });
    // 別の列は別扱い。
    expect(gridUiReducer(s1, gridActions.setColumnFilter('d', value)).filters.columnFilters.d).toBe(value);
    // custom は参照で比べる(深い比較はしない)。
    const custom1 = gridUiReducer(initial, gridActions.setColumnFilter('x', { kind: 'custom', value: { a: 1 } }));
    expect(gridUiReducer(custom1, gridActions.setColumnFilter('x', { kind: 'custom', value: { a: 1 } }))).not.toBe(
      custom1,
    );
  });

  it('filter/clearColumn / filter/resetAll: 何も掛かっていなければ no-op', () => {
    expect(gridUiReducer(initial, gridActions.clearColumnFilter('c'))).toBe(initial);
    expect(gridUiReducer(initial, gridActions.resetAllFilters())).toBe(initial);
    const s1 = gridUiReducer(initial, gridActions.setColumnFilter('c', { kind: 'text', value: 'x' }));
    expect(gridUiReducer(s1, gridActions.clearColumnFilter('d'))).toBe(s1);
    expect(gridUiReducer(s1, gridActions.clearColumnFilter('c')).filters.columnFilters).toEqual({});
    expect(gridUiReducer(s1, gridActions.resetAllFilters()).filters).toEqual({ globalText: '', columnFilters: {} });
    const s2 = gridUiReducer(initial, gridActions.setGlobalFilter('q'));
    expect(gridUiReducer(s2, gridActions.resetAllFilters()).filters.globalText).toBe('');
  });

  it('sort/set / sort/clear: 同じ中身なら no-op', () => {
    expect(gridUiReducer(initial, gridActions.clearSort())).toBe(initial);
    expect(gridUiReducer(initial, gridActions.setSort([]))).toBe(initial);
    const s1 = gridUiReducer(initial, gridActions.setSort([{ columnKey: 'a', direction: 'asc' }]));
    expect(gridUiReducer(s1, gridActions.setSort([{ columnKey: 'a', direction: 'asc' }]))).toBe(s1);
    expect(gridUiReducer(s1, gridActions.setSort([{ columnKey: 'a', direction: 'desc' }])).sort).toEqual([
      { columnKey: 'a', direction: 'desc' },
    ]);
    expect(gridUiReducer(s1, gridActions.clearSort()).sort).toEqual([]);
  });

  it('列操作の後始末(編集停止 / 選択解除 / アクティブセル解除)は、何も無ければ購読者へ通知しない', () => {
    const store = createGridStore(initial);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.dispatch(gridActions.stopEdit());
    store.dispatch(gridActions.clearSelection());
    store.dispatch(gridActions.activateCell(null));
    expect(notified).toBe(0);
    expect(store.getState()).toBe(initial);
  });
});