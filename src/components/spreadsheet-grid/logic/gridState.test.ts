import { describe, it, expect } from 'vitest';

import {
  GRID_STATE_VERSION,
  buildGridState,
  cloneColumnFilterValue,
  migrateGridState,
  isSameGridState,
  decideStateChangeEmit,
  extractColumnState,
  applyColumnState,
} from './gridState';
import type {
  ColumnFilterValue,
  GridColumn,
  GridColumnState,
  GridFilterState,
  GridSortState,
  ParsedNumberFilter,
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
    const state = buildGridState({}, emptyFilters(), [], [], 7);
    expect(state.version).toBe(7);
  });

  it('追加(v2): columns(列メタ)を複製して含める', () => {
    const columns: GridColumnState[] = [
      { key: 'a', visible: false },
      { key: 'b', pinned: 'left' },
    ];
    const state = buildGridState({}, emptyFilters(), [], columns);
    expect(state.columns).toEqual(columns);
    expect(state.columns).not.toBe(columns);
    expect(state.columns?.[0]).not.toBe(columns[0]);
    // 返り値の mutate は元へ波及しない。
    state.columns?.push({ key: 'c' });
    expect(columns).toHaveLength(2);
  });

  it('追加(v2): columns 省略時は空配列', () => {
    const state = buildGridState({}, emptyFilters(), []);
    expect(state.columns).toEqual([]);
  });
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

  it('追加(v2): columns 無し(v1 保存値)は undefined になる(後方互換)', () => {
    const migrated = migrateGridState({
      version: 1,
      columnWidths: { a: 100 },
      filters: { globalText: '', columnFilters: {} },
      sort: [],
    });
    expect(migrated.columns).toBeUndefined();
  });

  it('追加(v2): columns を正規化する(key 必須・visible は boolean のみ・pinned は left/right のみ)', () => {
    const migrated = migrateGridState({
      version: 2,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
      columns: [
        { key: 'a', visible: false, pinned: 'left' },
        { key: 'b', visible: 'yes', pinned: 'middle' }, // visible/pinned 不正 → 当該フィールドは省略
        { key: 'c' },
        { visible: true }, // key 無し → drop
        'broken', // オブジェクトでない → drop
      ],
    });
    expect(migrated.columns).toEqual([
      { key: 'a', visible: false, pinned: 'left' },
      { key: 'b' },
      { key: 'c' },
    ]);
  });

  it('追加(v2): columns が配列でない(string 等)は undefined・空配列 / 全無効は空配列を保持', () => {
    // 配列でない → undefined(列メタ未適用)。
    expect(
      migrateGridState({ version: 2, columns: 'x' }).columns,
    ).toBeUndefined();
    // 空配列 → 空配列(present だが列メタ無し。buildGridState 出力との往復一致のため潰さない)。
    expect(migrateGridState({ version: 2, columns: [] }).columns).toEqual([]);
    // 全無効エントリ → フィルター後の空配列(配列ではあるので [] を返す)。
    expect(
      migrateGridState({ version: 2, columns: [{ noKey: 1 }, 42] }).columns,
    ).toEqual([]);
  });

  it('追加(v2): columns の返り値は入力と参照を共有しない', () => {
    const input = {
      version: 2,
      columns: [{ key: 'a', visible: false }],
    };
    const migrated = migrateGridState(input);
    input.columns[0].visible = true;
    expect(migrated.columns).toEqual([{ key: 'a', visible: false }]);
  });
});
// テスト用: GridState を手早く組み立てるヘルパ(columnWidths / columnFilters / sort / globalText)。
const st = (
  columnWidths: Record<string, number> = {},
  columnFilters: Record<string, ColumnFilterValue> = {},
  sort: GridSortState = [],
  globalText = '',
) => buildGridState(columnWidths, { globalText, columnFilters }, sort);

describe('isSameGridState', () => {
  it('同一内容は true', () => {
    expect(isSameGridState(st({ a: 100 }), st({ a: 100 }))).toBe(true);
  });

  it('version 違いは false', () => {
    const a = buildGridState({}, emptyFilters(), [], [], 1);
    const b = buildGridState({}, emptyFilters(), [], [], 2);
    expect(isSameGridState(a, b)).toBe(false);
  });

  it('columnWidths: 値違い / キー集合違いは false', () => {
    expect(isSameGridState(st({ a: 100 }), st({ a: 120 }))).toBe(false);
    expect(isSameGridState(st({ a: 100 }), st({ a: 100, b: 50 }))).toBe(false);
    expect(isSameGridState(st({ a: 100 }), st({ b: 100 }))).toBe(false);
  });

  it('globalText 違いは false', () => {
    expect(isSameGridState(st({}, {}, [], 'x'), st({}, {}, [], 'y'))).toBe(false);
  });

  it('set フィルター: values / mode を比較', () => {
    expect(
      isSameGridState(
        st({}, { c: { kind: 'set', values: ['a', 'b'] } }),
        st({}, { c: { kind: 'set', values: ['a', 'b'] } }),
      ),
    ).toBe(true);
    expect(
      isSameGridState(
        st({}, { c: { kind: 'set', values: ['a'] } }),
        st({}, { c: { kind: 'set', values: ['a', 'b'] } }),
      ),
    ).toBe(false);
    // mode 既定(include)vs 明示 include は等価。
    expect(
      isSameGridState(
        st({}, { c: { kind: 'set', values: ['a'] } }),
        st({}, { c: { kind: 'set', mode: 'include', values: ['a'] } }),
      ),
    ).toBe(true);
    // include vs exclude は不等。
    expect(
      isSameGridState(
        st({}, { c: { kind: 'set', mode: 'include', values: ['a'] } }),
        st({}, { c: { kind: 'set', mode: 'exclude', values: ['a'] } }),
      ),
    ).toBe(false);
  });

  it('number フィルター: raw / parsed を比較', () => {
    const mk = (
      raw: string,
      parsed: ParsedNumberFilter | null,
    ): ColumnFilterValue => ({ kind: 'number', raw, parsed });
    expect(
      isSameGridState(
        st({}, { n: mk('>5', { mode: 'comparison', operator: '>', value: 5 }) }),
        st({}, { n: mk('>5', { mode: 'comparison', operator: '>', value: 5 }) }),
      ),
    ).toBe(true);
    expect(
      isSameGridState(
        st({}, { n: mk('>5', { mode: 'comparison', operator: '>', value: 5 }) }),
        st({}, { n: mk('>6', { mode: 'comparison', operator: '>', value: 6 }) }),
      ),
    ).toBe(false);
    // parsed null vs 非 null は不等。
    expect(
      isSameGridState(
        st({}, { n: mk('foo', null) }),
        st({}, { n: mk('foo', { mode: 'comparison', operator: '=', value: 0 }) }),
      ),
    ).toBe(false);
    // range の中身違い。
    expect(
      isSameGridState(
        st({}, { n: mk('1-5', { mode: 'range', min: 1, max: 5 }) }),
        st({}, { n: mk('1-5', { mode: 'range', min: 1, max: 9 }) }),
      ),
    ).toBe(false);
  });

  it('text/date/select: value を比較、同キー kind 違いは false', () => {
    expect(
      isSameGridState(
        st({}, { t: { kind: 'text', value: 'x' } }),
        st({}, { t: { kind: 'text', value: 'x' } }),
      ),
    ).toBe(true);
    expect(
      isSameGridState(
        st({}, { t: { kind: 'text', value: 'x' } }),
        st({}, { t: { kind: 'text', value: 'y' } }),
      ),
    ).toBe(false);
    expect(
      isSameGridState(
        st({}, { t: { kind: 'text', value: 'x' } }),
        st({}, { t: { kind: 'select', value: 'x' } }),
      ),
    ).toBe(false);
  });

  it('custom: value 参照同一なら true、別参照なら false', () => {
    const shared = { deep: 1 };
    expect(
      isSameGridState(
        st({}, { c: { kind: 'custom', value: shared } }),
        st({}, { c: { kind: 'custom', value: shared } }),
      ),
    ).toBe(true);
    expect(
      isSameGridState(
        st({}, { c: { kind: 'custom', value: { deep: 1 } } }),
        st({}, { c: { kind: 'custom', value: { deep: 1 } } }),
      ),
    ).toBe(false);
  });

  it('columnFilters のキー集合違いは false', () => {
    expect(
      isSameGridState(
        st({}, { a: { kind: 'text', value: 'x' } }),
        st({}, {
          a: { kind: 'text', value: 'x' },
          b: { kind: 'text', value: 'y' },
        }),
      ),
    ).toBe(false);
  });

  it('sort: 長さ / 順序 / direction を比較', () => {
    expect(
      isSameGridState(
        st({}, {}, [{ columnKey: 'a', direction: 'asc' }]),
        st({}, {}, [{ columnKey: 'a', direction: 'asc' }]),
      ),
    ).toBe(true);
    expect(
      isSameGridState(
        st({}, {}, [{ columnKey: 'a', direction: 'asc' }]),
        st({}, {}, [{ columnKey: 'a', direction: 'desc' }]),
      ),
    ).toBe(false);
    expect(
      isSameGridState(
        st({}, {}, [
          { columnKey: 'a', direction: 'asc' },
          { columnKey: 'b', direction: 'asc' },
        ]),
        st({}, {}, [
          { columnKey: 'b', direction: 'asc' },
          { columnKey: 'a', direction: 'asc' },
        ]),
      ),
    ).toBe(false);
    expect(
      isSameGridState(
        st({}, {}, [{ columnKey: 'a', direction: 'asc' }]),
        st({}, {}, []),
      ),
    ).toBe(false);
  });

  it('追加(v2): columns 順序違いは false', () => {
    const a = buildGridState({}, emptyFilters(), [], [{ key: 'a' }, { key: 'b' }]);
    const b = buildGridState({}, emptyFilters(), [], [{ key: 'b' }, { key: 'a' }]);
    expect(isSameGridState(a, b)).toBe(false);
  });

  it('追加(v2): columns の visible / pinned 違いは false', () => {
    const base = (cols: GridColumnState[]) =>
      buildGridState({}, emptyFilters(), [], cols);
    expect(
      isSameGridState(
        base([{ key: 'a', visible: false }]),
        base([{ key: 'a', visible: true }]),
      ),
    ).toBe(false);
    expect(
      isSameGridState(
        base([{ key: 'a', pinned: 'left' }]),
        base([{ key: 'a', pinned: 'right' }]),
      ),
    ).toBe(false);
  });

  it('追加(v2): columns 同一(順序 + visible + pinned 一致)は別配列でも true', () => {
    const cols: GridColumnState[] = [
      { key: 'a', visible: false },
      { key: 'b', pinned: 'left' },
    ];
    const a = buildGridState({}, emptyFilters(), [], cols.map((c) => ({ ...c })));
    const b = buildGridState({}, emptyFilters(), [], cols.map((c) => ({ ...c })));
    expect(isSameGridState(a, b)).toBe(true);
  });

  it('追加(v2): columns 未指定(undefined・v1 migrate)と空配列(buildGridState)は不等', () => {
    const v1 = migrateGridState({
      version: 1,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
    });
    const built = buildGridState({}, emptyFilters(), []); // columns: []
    expect(v1.columns).toBeUndefined();
    expect(built.columns).toEqual([]);
    expect(isSameGridState(v1, built)).toBe(false);
  });
});

describe('decideStateChangeEmit', () => {
  const A = st({ a: 100 });
  const B = st({ a: 200 });

  it('ドラッグ中は発火せず lastEmitted を据え置く(prevLast を返す)', () => {
    const d = decideStateChangeEmit(A, B, true);
    expect(d.emit).toBe(false);
    expect(d.nextLast).toBe(A);
  });

  it('ドラッグ中は current が prevLast と異なっても保留(中間幅を通知しない)', () => {
    const d = decideStateChangeEmit(A, st({ a: 150 }), true);
    expect(d.emit).toBe(false);
    expect(d.nextLast).toBe(A);
  });

  it('初回(prevLast=null)は発火せず current を記録', () => {
    const d = decideStateChangeEmit(null, A, false);
    expect(d.emit).toBe(false);
    expect(d.nextLast).toBe(A);
  });

  it('前回と同値なら発火せず current を記録', () => {
    const same = st({ a: 100 });
    const d = decideStateChangeEmit(A, same, false);
    expect(d.emit).toBe(false);
    expect(d.nextLast).toBe(same);
  });

  it('変化あり(非ドラッグ)は発火し current を記録', () => {
    const d = decideStateChangeEmit(A, B, false);
    expect(d.emit).toBe(true);
    expect(d.nextLast).toBe(B);
  });
});

// テスト用: GridColumn を手早く生成します(width 既定 100。visible / pinned / flex / 非シリアライズ
//   項目を opts で上書き。key / width は確定値で常に上書きします)。
type TestRow = { id: number };
const col = (
  key: string,
  opts: Partial<GridColumn<TestRow>> = {},
): GridColumn<TestRow> => ({
  ...opts,
  key,
  width: opts.width ?? 100,
});

describe('extractColumnState (追加 v2)', () => {
  it('key / visible / pinned を配列順で抽出する', () => {
    const result = extractColumnState([
      col('a', { visible: false }),
      col('b', { pinned: 'left' }),
      col('c'),
    ]);
    expect(result).toEqual([
      { key: 'a', visible: false },
      { key: 'b', pinned: 'left' },
      { key: 'c' },
    ]);
  });

  it('visible / pinned 未指定のフィールドは省略する(JSON 往復後の形と一致)', () => {
    const [entry] = extractColumnState([col('a')]);
    expect(entry).toEqual({ key: 'a' });
    expect('visible' in entry).toBe(false);
    expect('pinned' in entry).toBe(false);
  });

  it('flex / width は含めない', () => {
    const [entry] = extractColumnState([col('a', { flex: 2, width: 250 })]);
    expect(entry).toEqual({ key: 'a' });
  });
});

describe('applyColumnState (追加 v2)', () => {
  it('保存 key 順に並べ替える(reorder の復元)', () => {
    const current = [col('a'), col('b'), col('c')];
    const result = applyColumnState(
      current,
      [{ key: 'c' }, { key: 'a' }, { key: 'b' }],
      {},
    );
    expect(result.map((c) => c.key)).toEqual(['c', 'a', 'b']);
  });

  it('visible / pinned を適用し、pane 連結正規化する(left→center→right)', () => {
    const current = [col('a'), col('b'), col('c')];
    const result = applyColumnState(
      current,
      [
        { key: 'a', pinned: 'right' },
        { key: 'b' },
        { key: 'c', pinned: 'left' },
      ],
      {},
    );
    // reorderColumnsByPane: left=[c], center=[b], right=[a]
    expect(result.map((c) => c.key)).toEqual(['c', 'b', 'a']);
    expect(result.find((c) => c.key === 'a')?.pinned).toBe('right');
    expect(result.find((c) => c.key === 'c')?.pinned).toBe('left');
    expect(result.find((c) => c.key === 'b')?.pinned).toBeUndefined();
  });

  it('visible=undefined / pinned=undefined も反映する(既定へ戻す)', () => {
    const current = [col('a', { visible: false, pinned: 'left' })];
    const result = applyColumnState(current, [{ key: 'a' }], {});
    expect(result[0].visible).toBeUndefined();
    expect(result[0].pinned).toBeUndefined();
  });

  it('savedWidths を column.width へ焼き込む(非 flex)', () => {
    const current = [col('a', { width: 100 }), col('b', { width: 200 })];
    const result = applyColumnState(current, [{ key: 'a' }, { key: 'b' }], {
      a: 150,
    });
    expect(result.find((c) => c.key === 'a')?.width).toBe(150);
    expect(result.find((c) => c.key === 'b')?.width).toBe(200);
  });

  it('保存にあって現 columns に無い key は drop', () => {
    const current = [col('a'), col('b')];
    const result = applyColumnState(
      current,
      [{ key: 'a' }, { key: 'x' }, { key: 'b' }],
      {},
    );
    expect(result.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('現 columns にあって保存に無い key は末尾へ追加(相対順を保持)', () => {
    const current = [col('a'), col('b'), col('c')];
    const result = applyColumnState(current, [{ key: 'c' }, { key: 'a' }], {});
    // saved 順 [c, a] の後ろへ未保存の b を追加。
    expect(result.map((c) => c.key)).toEqual(['c', 'a', 'b']);
  });

  it('render fn / title / flex など非シリアライズ項目を引き継ぐ', () => {
    const renderCell = () => null;
    const current = [col('a', { title: 'A', flex: 3, renderCell, visible: true })];
    const result = applyColumnState(current, [{ key: 'a', visible: false }], {});
    expect(result[0].title).toBe('A');
    expect(result[0].flex).toBe(3);
    expect(result[0].renderCell).toBe(renderCell);
    expect(result[0].visible).toBe(false); // 保存値で上書き
  });

  it('変更不要な列(meta 無し + 保存幅無し)は要素参照を保持する', () => {
    const a = col('a');
    const result = applyColumnState([a], [], {});
    // 保存メタ空 → a は新規列扱いで末尾追加。meta 無し + 幅無しなので同一要素参照。
    expect(result[0]).toBe(a);
  });
});