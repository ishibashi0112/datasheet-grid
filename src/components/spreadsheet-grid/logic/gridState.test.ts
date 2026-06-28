import { describe, it, expect } from 'vitest';

import {
  GRID_STATE_VERSION,
  buildGridState,
  cloneColumnFilterValue,
  migrateGridState,
} from './gridState';
import type {
  ColumnFilterValue,
  GridFilterState,
  GridSortState,
} from '../model/gridTypes';

const emptyFilters = (): GridFilterState => ({
  globalText: '',
  columnFilters: {},
});

describe('cloneColumnFilterValue', () => {
  it('set: values 配列を複製する(複製の mutate は元へ波及しない)', () => {
    const original: ColumnFilterValue = { kind: 'set', values: ['a', 'b'] };
    const cloned = cloneColumnFilterValue(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    if (cloned.kind === 'set') {
      expect(cloned.values).not.toBe(original.kind === 'set' ? original.values : undefined);
      cloned.values.push('c');
    }
    expect(original).toEqual({ kind: 'set', values: ['a', 'b'] });
  });

  it('number: parsed(入れ子)も複製する', () => {
    const original: ColumnFilterValue = {
      kind: 'number',
      raw: '>5',
      parsed: { mode: 'comparison', operator: '>', value: 5 },
    };
    const cloned = cloneColumnFilterValue(original);
    expect(cloned).toEqual(original);
    if (cloned.kind === 'number' && original.kind === 'number') {
      expect(cloned.parsed).not.toBe(original.parsed);
    }
  });

  it('number: parsed=null はそのまま', () => {
    const original: ColumnFilterValue = {
      kind: 'number',
      raw: 'foo',
      parsed: null,
    };
    const cloned = cloneColumnFilterValue(original);
    expect(cloned).toEqual(original);
    if (cloned.kind === 'number') {
      expect(cloned.parsed).toBeNull();
    }
  });

  it('text / date / select: 値は等価で別オブジェクト', () => {
    const text: ColumnFilterValue = { kind: 'text', value: 'abc' };
    const date: ColumnFilterValue = { kind: 'date', value: '2024' };
    const select: ColumnFilterValue = { kind: 'select', value: 'X' };
    expect(cloneColumnFilterValue(text)).toEqual(text);
    expect(cloneColumnFilterValue(text)).not.toBe(text);
    expect(cloneColumnFilterValue(date)).toEqual(date);
    expect(cloneColumnFilterValue(select)).toEqual(select);
  });

  it('custom: value(unknown)は参照共有のまま', () => {
    const nested = { deep: 1 };
    const original: ColumnFilterValue = { kind: 'custom', value: nested };
    const cloned = cloneColumnFilterValue(original);
    expect(cloned).toEqual(original);
    if (cloned.kind === 'custom') {
      // value は深いコピーをしない契約なので同一参照。
      expect(cloned.value).toBe(nested);
    }
  });
});

describe('buildGridState', () => {
  it('version を現行スキーマ番号で焼く', () => {
    const state = buildGridState({}, emptyFilters(), []);
    expect(state.version).toBe(GRID_STATE_VERSION);
  });

  it('columnWidths を複製する(返り値の mutate は元へ波及しない)', () => {
    const widths = { a: 100, b: 200 };
    const state = buildGridState(widths, emptyFilters(), []);
    expect(state.columnWidths).toEqual(widths);
    expect(state.columnWidths).not.toBe(widths);
    state.columnWidths.a = 999;
    expect(widths.a).toBe(100);
  });

  it('filters を複製する(globalText / columnFilters / 値まで切り離す)', () => {
    const filters: GridFilterState = {
      globalText: 'q',
      columnFilters: {
        s: { kind: 'set', values: ['x'] },
        t: { kind: 'text', value: 'abc' },
      },
    };
    const state = buildGridState({}, filters, []);
    expect(state.filters).toEqual(filters);
    expect(state.filters).not.toBe(filters);
    expect(state.filters.columnFilters).not.toBe(filters.columnFilters);
    expect(state.filters.columnFilters.s).not.toBe(filters.columnFilters.s);
    // 返り値の値を mutate しても元へ波及しない。
    const cloned = state.filters.columnFilters.s;
    if (cloned.kind === 'set') {
      cloned.values.push('y');
    }
    expect(filters.columnFilters.s).toEqual({ kind: 'set', values: ['x'] });
  });

  it('sort エントリを複製する', () => {
    const sort: GridSortState = [{ columnKey: 'a', direction: 'asc' }];
    const state = buildGridState({}, emptyFilters(), sort);
    expect(state.sort).toEqual(sort);
    expect(state.sort).not.toBe(sort);
    expect(state.sort[0]).not.toBe(sort[0]);
  });

  it('version を明示指定できる', () => {
    const state = buildGridState({}, emptyFilters(), [], 7);
    expect(state.version).toBe(7);
  });
});

describe('migrateGridState', () => {
  it('buildGridState の出力を round-trip できる', () => {
    const filters: GridFilterState = {
      globalText: 'q',
      columnFilters: {
        s: { kind: 'set', values: ['x', 'y'] },
        n: { kind: 'number', raw: '>5', parsed: { mode: 'comparison', operator: '>', value: 5 } },
      },
    };
    const sort: GridSortState = [
      { columnKey: 'a', direction: 'asc' },
      { columnKey: 'b', direction: 'desc' },
    ];
    const built = buildGridState({ a: 120 }, filters, sort);
    const migrated = migrateGridState(built);
    expect(migrated).toEqual(built);
  });

  it('非オブジェクト入力は空状態(現行 version)へ畳む', () => {
    const expected = {
      version: GRID_STATE_VERSION,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
    };
    expect(migrateGridState(null)).toEqual(expected);
    expect(migrateGridState(undefined)).toEqual(expected);
    expect(migrateGridState('nope')).toEqual(expected);
    expect(migrateGridState(42)).toEqual(expected);
  });

  it('columnWidths は有限数値のみ採用する', () => {
    const migrated = migrateGridState({
      columnWidths: { a: 100, b: 'x', c: NaN, d: Infinity, e: 50 },
    });
    expect(migrated.columnWidths).toEqual({ a: 100, e: 50 });
  });

  it('filters: globalText 非 string は空に、columnFilters は kind 必須', () => {
    const migrated = migrateGridState({
      filters: {
        globalText: 123,
        columnFilters: {
          ok: { kind: 'text', value: 'abc' },
          noKind: { value: 'abc' },
          notObj: 'abc',
        },
      },
    });
    expect(migrated.filters.globalText).toBe('');
    expect(Object.keys(migrated.filters.columnFilters)).toEqual(['ok']);
    expect(migrated.filters.columnFilters.ok).toEqual({ kind: 'text', value: 'abc' });
  });

  it('filters 欠損 / columnFilters 非オブジェクトは既定へ', () => {
    expect(migrateGridState({}).filters).toEqual({ globalText: '', columnFilters: {} });
    expect(
      migrateGridState({ filters: { columnFilters: 5 } }).filters,
    ).toEqual({ globalText: '', columnFilters: {} });
  });

  it('sort: 配列以外は []、無効エントリは捨てる', () => {
    expect(migrateGridState({ sort: 'x' }).sort).toEqual([]);
    const migrated = migrateGridState({
      sort: [
        { columnKey: 'a', direction: 'asc' },
        { columnKey: 'b', direction: 'sideways' },
        { direction: 'asc' },
        { columnKey: 'c', direction: 'desc' },
        null,
      ],
    });
    expect(migrated.sort).toEqual([
      { columnKey: 'a', direction: 'asc' },
      { columnKey: 'c', direction: 'desc' },
    ]);
  });

  it('version は入力値に関わらず現行へ揃える', () => {
    expect(migrateGridState({ version: 999 }).version).toBe(GRID_STATE_VERSION);
  });

  it('返り値は入力と参照を共有しない(入力 mutate は出力へ波及しない)', () => {
    const input = {
      version: 1,
      columnWidths: { a: 100 },
      filters: { globalText: 'q', columnFilters: { s: { kind: 'set', values: ['x'] } } },
      sort: [{ columnKey: 'a', direction: 'asc' }],
    };
    const migrated = migrateGridState(input);
    // 入力側を書き換える。
    input.columnWidths.a = 999;
    (input.filters.columnFilters.s as { values: string[] }).values.push('y');
    input.sort.push({ columnKey: 'z', direction: 'desc' });
    expect(migrated.columnWidths).toEqual({ a: 100 });
    expect(migrated.filters.columnFilters.s).toEqual({ kind: 'set', values: ['x'] });
    expect(migrated.sort).toEqual([{ columnKey: 'a', direction: 'asc' }]);
  });
});