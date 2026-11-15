// 追加(1.0.2 / 2026-11-09 実アプリの総点検 C-03): columns から消えた列のフィルターとソートを捨てる reducer の契約テスト。
import { describe, it, expect } from 'vitest';
import { gridActions } from './gridActions';
import { createInitialGridUiState, gridUiReducer } from './gridReducer';
import type { GridColumn } from './gridTypes.unbound';

const col = (key: string): GridColumn<unknown> => ({ key, title: key, width: 80 });

const withFilterAndSort = () => {
  let s = createInitialGridUiState();
  s = gridUiReducer(s, gridActions.setColumnFilter('d31', { kind: 'set', values: ['夜'] }));
  s = gridUiReducer(s, gridActions.setColumnFilter('name', { kind: 'text', value: 'a' }));
  s = gridUiReducer(s, gridActions.setSort([{ columnKey: 'd31', direction: 'asc' }, { columnKey: 'name', direction: 'desc' }]));
  return s;
};

describe('gridUiReducer (columnWidths/reconcile で消えた列の条件を捨てる)', () => {
  it('前の columns にあって今の columns に無い列のフィルターとソートを捨てる', () => {
    const s = withFilterAndSort();
    const next = gridUiReducer(
      s,
      gridActions.reconcileColumnWidths([col('name'), col('d31')], [col('name')]),
    );
    expect(Object.keys(next.filters.columnFilters)).toEqual(['name']);
    expect(next.sort).toEqual([{ columnKey: 'name', direction: 'desc' }]);
  });

  it('初めての columns(前が無い)・前にも無かった列・消えた列が無いときは触らない(同一参照)', () => {
    const s = withFilterAndSort();
    expect(gridUiReducer(s, gridActions.reconcileColumnWidths(null, [col('name')]))).toBe(s);
    expect(gridUiReducer(s, gridActions.reconcileColumnWidths([col('name')], [col('name')]))).toBe(s);
    expect(gridUiReducer(s, gridActions.reconcileColumnWidths([col('name'), col('x')], [col('name')]))).toBe(s);
  });
});