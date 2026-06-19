// V-1: sortOrder の B-1 等価性テスト(旧 adhoc ハーネスの恒久化)。
//   sortOrder は内部で「全列数値 → Float64 fast path / それ以外 → unknown[] fallback」を
//   自動選択します。両経路の正解は同一の compareUnknownValues 意味論(数値なら数値差、
//   それ以外は STRING_COLLATOR、source index タイブレーク)なので、compareUnknownValues を
//   常用する参照実装と sortOrder の出力がバイト等価であることを検査します。
//   - all-numeric / numeric-string → fast path を踏む。
//   - 非有限混在 / 文字列二次キー → fallback を踏む。
//   どちらのデータでも参照と一致すれば、fast path ≡ fallback ≡ 旧実装が担保されます。
import { describe, it, expect } from 'vitest';
import { compareUnknownValues, sortOrder } from './sorting';
import { createSourceOrder, type RowOrder } from './filtering';
import { getCellValue } from '../utils/permissions';
import type { GridColumn, GridSortState } from '../model/gridTypes';

type Row = Record<string, unknown>;

const col = (key: string): GridColumn<Row> => ({ key, width: 100 });

// 参照実装: 比較は常に compareUnknownValues。sortOrder の規約(列解決・優先順位・
//   未解決スキップ・有効キー 0 件は同一参照・source index タイブレーク)を素朴に再現します。
const referenceSortOrder = (
  rows: Row[],
  order: RowOrder,
  columns: GridColumn<Row>[],
  sort: GridSortState,
): RowOrder => {
  if (sort.length === 0) {
    return order;
  }
  const resolved = sort
    .map((entry) => {
      const column = columns.find((item) => item.key === entry.columnKey);
      return column
        ? { column, multiplier: entry.direction === 'asc' ? 1 : -1 }
        : null;
    })
    .filter(
      (item): item is { column: GridColumn<Row>; multiplier: number } =>
        item !== null,
    );
  if (resolved.length === 0) {
    return order;
  }
  const length = order.length;
  const keyColumns = resolved.map(({ column }) => {
    const keys = new Array<unknown>(length);
    for (let pos = 0; pos < length; pos += 1) {
      keys[pos] = getCellValue(rows[order[pos]], column);
    }
    return keys;
  });
  const positions = Array.from({ length }, (_, i) => i);
  positions.sort((a, b) => {
    for (let c = 0; c < resolved.length; c += 1) {
      const compared = compareUnknownValues(keyColumns[c][a], keyColumns[c][b]);
      if (compared !== 0) {
        return compared * resolved[c].multiplier;
      }
    }
    return order[a] - order[b];
  });
  const result = new Int32Array(length);
  for (let i = 0; i < length; i += 1) {
    result[i] = order[positions[i]];
  }
  return result;
};

const asArray = (order: RowOrder): number[] => Array.from(order);

type Dataset = {
  name: string;
  rows: Row[];
  columns: GridColumn<Row>[];
  sort: GridSortState;
  // fast path(全列数値)を踏むはずか(到達経路を明示するための注記・assert 用)。
  expectFastPath: boolean;
};

const seededRows = (count: number, mod: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    n: ((i * 7919) % mod) - Math.floor(mod / 2),
    s: String.fromCharCode(97 + ((i * 13) % 26)) + ((i * 31) % 100),
  }));

const datasets: Dataset[] = [
  {
    name: 'all-numeric asc (fast path / single column)',
    rows: [{ n: 3 }, { n: 1 }, { n: 2 }, { n: 1 }, { n: -5 }],
    columns: [col('n')],
    sort: [{ columnKey: 'n', direction: 'asc' }],
    expectFastPath: true,
  },
  {
    name: 'all-numeric desc (fast path / single column)',
    rows: [{ n: 3 }, { n: 1 }, { n: 2 }, { n: 1 }, { n: -5 }],
    columns: [col('n')],
    sort: [{ columnKey: 'n', direction: 'desc' }],
    expectFastPath: true,
  },
  {
    name: 'numeric strings (fast path / Number() finite)',
    rows: [{ n: '10' }, { n: '2' }, { n: '100' }, { n: '2' }, { n: '-1' }],
    columns: [col('n')],
    sort: [{ columnKey: 'n', direction: 'asc' }],
    expectFastPath: true,
  },
  {
    name: 'all-numeric multi-column (fast path / multi)',
    rows: [
      { a: 1, b: 2 },
      { a: 1, b: 1 },
      { a: 2, b: 5 },
      { a: 1, b: 1 },
      { a: 0, b: 9 },
    ],
    columns: [col('a'), col('b')],
    sort: [
      { columnKey: 'a', direction: 'asc' },
      { columnKey: 'b', direction: 'desc' },
    ],
    expectFastPath: true,
  },
  {
    name: 'mixed non-finite (fallback)',
    rows: [{ n: 3 }, { n: 'abc' }, { n: 2 }, { n: '' }, { n: 1 }],
    columns: [col('n')],
    sort: [{ columnKey: 'n', direction: 'asc' }],
    expectFastPath: false,
  },
  {
    name: 'string secondary key forces fallback (multi)',
    rows: [
      { a: 1, s: 'pear' },
      { a: 1, s: 'apple' },
      { a: 2, s: 'kiwi' },
      { a: 1, s: 'apple' },
    ],
    columns: [col('a'), col('s')],
    sort: [
      { columnKey: 'a', direction: 'asc' },
      { columnKey: 's', direction: 'asc' },
    ],
    expectFastPath: false,
  },
  {
    name: 'duplicates → stable by source index (fast path)',
    rows: Array.from({ length: 50 }, () => ({ n: 7 })),
    columns: [col('n')],
    sort: [{ columnKey: 'n', direction: 'desc' }],
    expectFastPath: true,
  },
  {
    name: 'large all-numeric (fast path / 5000 rows)',
    rows: seededRows(5000, 997),
    columns: [col('n')],
    sort: [{ columnKey: 'n', direction: 'asc' }],
    expectFastPath: true,
  },
  {
    name: 'large mixed (fallback / numeric + string cols, 5000 rows)',
    rows: seededRows(5000, 997),
    columns: [col('n'), col('s')],
    sort: [
      { columnKey: 'n', direction: 'desc' },
      { columnKey: 's', direction: 'asc' },
    ],
    expectFastPath: false,
  },
];

describe('sortOrder (B-1 equivalence with compareUnknownValues reference)', () => {
  it.each(datasets)('$name', ({ rows, columns, sort }) => {
    const order = createSourceOrder(rows.length);
    const actual = sortOrder(rows, order, columns, sort);
    const expected = referenceSortOrder(rows, order, columns, sort);
    expect(asArray(actual)).toEqual(asArray(expected));
  });

  it('returns the same reference when sort is empty', () => {
    const rows: Row[] = [{ n: 1 }, { n: 2 }];
    const order = createSourceOrder(rows.length);
    expect(sortOrder(rows, order, [col('n')], [])).toBe(order);
  });

  it('returns the same reference when no sort entry resolves to a column', () => {
    const rows: Row[] = [{ n: 1 }, { n: 2 }];
    const order = createSourceOrder(rows.length);
    const sort: GridSortState = [{ columnKey: 'missing', direction: 'asc' }];
    expect(sortOrder(rows, order, [col('n')], sort)).toBe(order);
  });

  it('sorts a pre-filtered order (non-identity input order) consistently', () => {
    const rows: Row[] = [{ n: 5 }, { n: 1 }, { n: 9 }, { n: 3 }, { n: 7 }];
    // 偶数 source index のみ残したビュー順(フィルター後相当)。
    const order = Int32Array.from([0, 2, 4]);
    const sort: GridSortState = [{ columnKey: 'n', direction: 'asc' }];
    const actual = sortOrder(rows, order, [col('n')], sort);
    const expected = referenceSortOrder(rows, order, [col('n')], sort);
    expect(asArray(actual)).toEqual(asArray(expected));
    // 念のため: 出力は入力 order の置換であり、source index 集合を保存する。
    expect([...actual].sort((x, y) => x - y)).toEqual([0, 2, 4]);
  });
});