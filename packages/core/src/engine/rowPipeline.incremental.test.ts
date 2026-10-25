// 監査 B-10 / L-15: 行パイプラインの差分経路と、相対日付プリセットの基準日の扱いのテスト。
//   - B-10: rows だけが変わったとき、絞り込み / 並びが変わらなければ前回の order の参照を返し、変わったときは
//     毎回作り直したパイプラインと同じ結果になる。
//   - L-15: relativeDateKey(基準日)が変わったら列フィルターを評価し直し、serverSide の queryKey も変わる。
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRowPipelineResolver, type RowOrderInputs } from './rowPipeline';
import { fullCoreFeatures } from './fullFeatures';
import type { ColumnFilterValue, GridColumn, GridSortState } from '../model/gridTypes.unbound';

type Row = { id: number; name: string; amount: number | string | null; date: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名前', width: 120 },
  { key: 'amount', title: '金額', width: 100, filterType: 'number' },
  { key: 'date', title: '日付', width: 100, filterType: 'date' },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `n${(i * 7) % 13}`,
    amount: (i * 37) % 101,
    date: `2026-10-${String(10 + (i % 5)).padStart(2, '0')}`,
  }));

const AMOUNT_AT_LEAST_30: ColumnFilterValue = {
  kind: 'number',
  raw: '>=30',
  parsed: { mode: 'comparison', operator: '>=', value: 30 },
};

// 毎回作り直したパイプライン(キャッシュ無し)の結果 = 正解。
const freshOrder = (inputs: Omit<RowOrderInputs<Row>, 'globalFilteredOrder'>) => {
  const pipeline = createRowPipelineResolver<Row>(fullCoreFeatures.filtering);
  return Array.from(
    pipeline.resolveOrder({ ...inputs, globalFilteredOrder: pipeline.resolveBaseOrder(inputs.rows.length) }).order,
  );
};

const setup = (sort: GridSortState, columnFilters: Record<string, ColumnFilterValue> = {}) => {
  const pipeline = createRowPipelineResolver<Row>(fullCoreFeatures.filtering);
  const resolve = (nextRows: Row[], extra: Partial<RowOrderInputs<Row>> = {}) =>
    pipeline.resolveOrder({
      rows: nextRows,
      filterSortColumns: columns,
      columnFilters,
      globalFilteredOrder: pipeline.resolveBaseOrder(nextRows.length),
      sort,
      rowDragAvailable: false,
      ...extra,
    }).order;
  return { pipeline, resolve };
};

describe('resolveOrder の差分経路(監査 B-10)', () => {
  it('ソート列以外の編集では order の参照が変わらない', () => {
    const rows = makeRows(200);
    const sort: GridSortState = [{ columnKey: 'amount', direction: 'asc' }];
    const { resolve } = setup(sort);
    const first = resolve(rows);
    const edited = rows.slice();
    edited[5] = { ...edited[5], name: 'edited' };
    expect(resolve(edited)).toBe(first);
    // 同じ行の配列を作り直しただけでも同じ参照。
    expect(resolve(edited.slice())).toBe(first);
  });

  it('ソート列の編集では並びが変わり、作り直したパイプラインと同じ結果', () => {
    const rows = makeRows(200);
    const sort: GridSortState = [
      { columnKey: 'amount', direction: 'desc' },
      { columnKey: 'name', direction: 'asc' },
    ];
    const { resolve } = setup(sort);
    const first = resolve(rows);
    let current = rows;
    for (const [index, amount] of [
      [5, 1000],
      [17, -3],
      [5, null],
      [42, 'abc'],
      [42, 50],
    ] as const) {
      const next = current.slice();
      next[index] = { ...next[index], amount };
      const order = resolve(next);
      expect(order).not.toBe(first);
      expect(Array.from(order)).toEqual(freshOrder({ rows: next, filterSortColumns: columns, columnFilters: {}, sort, rowDragAvailable: false }));
      current = next;
    }
  });

  it('行オブジェクトをその場で書き換えて新しい配列を渡しても、並びは正しく追従する', () => {
    const rows = makeRows(50);
    const sort: GridSortState = [{ columnKey: 'amount', direction: 'asc' }];
    const { resolve } = setup(sort);
    resolve(rows);
    rows[3].amount = 999;
    const order = resolve(rows.slice());
    expect(order[order.length - 1]).toBe(3);
    expect(Array.from(order)).toEqual(freshOrder({ rows, filterSortColumns: columns, columnFilters: {}, sort, rowDragAvailable: false }));
  });

  it('列フィルター中: 絞り込み結果が変わらない編集では参照を保ち、変わる編集では正しく作り直す', () => {
    const rows = makeRows(120);
    const sort: GridSortState = [{ columnKey: 'name', direction: 'asc' }];
    const filters = { amount: AMOUNT_AT_LEAST_30 };
    const { resolve } = setup(sort, filters);
    const first = resolve(rows);
    // 絞り込みにもソートにも関係しない列の編集。
    const unrelated = rows.slice();
    unrelated[10] = { ...unrelated[10], date: '2030-01-01' };
    expect(resolve(unrelated)).toBe(first);
    // 絞り込みから外れる編集。
    const target = Array.from(first)[0];
    const excluded = unrelated.slice();
    excluded[target] = { ...excluded[target], amount: 0 };
    const order = resolve(excluded);
    expect(Array.from(order)).not.toContain(target);
    expect(Array.from(order)).toEqual(
      freshOrder({ rows: excluded, filterSortColumns: columns, columnFilters: filters, sort, rowDragAvailable: false }),
    );
  });

  it('ソートなしでは入力の order をそのまま返す(差分用のキーを持たない)', () => {
    const rows = makeRows(30);
    const { pipeline, resolve } = setup([]);
    expect(resolve(rows)).toBe(pipeline.resolveBaseOrder(rows.length));
  });

  it('ソートの方向を変えたら全件ソートし直す', () => {
    const rows = makeRows(80);
    const pipeline = createRowPipelineResolver<Row>(fullCoreFeatures.filtering);
    const base = pipeline.resolveBaseOrder(rows.length);
    const resolveWith = (sort: GridSortState) =>
      Array.from(
        pipeline.resolveOrder({ rows, filterSortColumns: columns, columnFilters: {}, globalFilteredOrder: base, sort, rowDragAvailable: false })
          .order,
      );
    const asc: GridSortState = [{ columnKey: 'amount', direction: 'asc' }];
    const desc: GridSortState = [{ columnKey: 'amount', direction: 'desc' }];
    expect(resolveWith(asc)).toEqual(freshOrder({ rows, filterSortColumns: columns, columnFilters: {}, sort: asc, rowDragAvailable: false }));
    expect(resolveWith(desc)).toEqual(freshOrder({ rows, filterSortColumns: columns, columnFilters: {}, sort: desc, rowDragAvailable: false }));
  });
});

describe('相対日付プリセットの基準日(監査 L-15)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const TODAY_FILTER: Record<string, ColumnFilterValue> = {
    date: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null },
  };

  it('基準日が変わったら列フィルターを評価し直す(変わらなければ前回の結果)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59));
    const rows = makeRows(20);
    const { resolve } = setup([], TODAY_FILTER);
    const dayOne = resolve(rows, { relativeDateKey: '2026-10-12' });
    expect(Array.from(dayOne).map((i) => rows[i].date)).toEqual(Array(4).fill('2026-10-12'));
    // 日付が変わっても、基準日が同じ間は(他の入力が同じなら)前回の結果。
    vi.setSystemTime(new Date(2026, 9, 13, 0, 1));
    expect(resolve(rows, { relativeDateKey: '2026-10-12' })).toBe(dayOne);
    // 基準日が変わったら翌日の範囲で評価し直す。
    const dayTwo = resolve(rows, { relativeDateKey: '2026-10-13' });
    expect(Array.from(dayTwo).map((i) => rows[i].date)).toEqual(Array(4).fill('2026-10-13'));
  });

  it('serverSide の queryKey: 基準日を渡したときだけ末尾に含める', () => {
    const pipeline = createRowPipelineResolver<Row>(fullCoreFeatures.filtering);
    const base = {
      isServerSide: true,
      globalFilterEnabled: true,
      globalText: '',
      columnFilterEnabled: true,
      columnFilters: TODAY_FILTER,
      sortingEnabled: true,
      sort: [],
    };
    const withoutKey = pipeline.resolveServerSideQuery(base);
    const dayOne = pipeline.resolveServerSideQuery({ ...base, relativeDateKey: '2026-10-12' });
    const dayOneAgain = pipeline.resolveServerSideQuery({ ...base, relativeDateKey: '2026-10-12' });
    const dayTwo = pipeline.resolveServerSideQuery({ ...base, relativeDateKey: '2026-10-13' });
    expect(dayOne.queryKey.startsWith(withoutKey.queryKey)).toBe(true);
    expect(dayOne.queryKey).not.toBe(withoutKey.queryKey);
    expect(dayOneAgain).toBe(dayOne);
    expect(dayTwo.queryKey).not.toBe(dayOne.queryKey);
    // query(サーバへ渡す中身)は相対のまま変わらない。
    expect(dayTwo.query).toBe(dayOne.query);
    // clientSide では常に空。
    expect(pipeline.resolveServerSideQuery({ ...base, isServerSide: false, relativeDateKey: '2026-10-13' }).queryKey).toBe('');
  });
});