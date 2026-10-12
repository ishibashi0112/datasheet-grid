// 監査 B-10: rows だけが変わったときの差分ソート(decorateSortKeys / diffSortKeys / repositionSortedPositions)が、
//   全件ソート(sortOrder)とつねに同じ結果になることを、乱数のデータと編集で確かめます。
import { describe, it, expect } from 'vitest';
import {
  decorateSortKeys,
  diffSortKeys,
  repositionSortedPositions,
  sortOrder,
  sortPositionsByKeys,
  undecorateSortedPositions,
} from './sorting';
import { createSourceOrder, type RowOrder } from './filtering';
import type { GridColumn, GridSortState } from '../model/gridTypes.unbound';

type Row = { a: unknown; b: unknown; c: unknown };

const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'A', width: 80 },
  { key: 'b', title: 'B', width: 80 },
  { key: 'c', title: 'C', width: 80 },
];

// 再現性のある乱数(mulberry32)。
const createRandom = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

// 値の種類: 数値 / 数値の文字列 / 文字列(大文字小文字違い・同値を含む)/ 空値。重複を多めにして同値の並びも試す。
const VALUE_POOLS = {
  numeric: [1, 2, 2, 3, -1, 0, 10, 1.5, '4', '2', null, undefined, '', ' '],
  mixed: [1, 2, 'a', 'B', 'b', 'abc', '10', 'x1', null, '', 3.5, 'Ａ'],
} as const;

const pick = (random: () => number, pool: readonly unknown[]) => pool[Math.floor(random() * pool.length)];

const makeRows = (random: () => number, count: number, pool: readonly unknown[]): Row[] =>
  Array.from({ length: count }, () => ({ a: pick(random, pool), b: pick(random, pool), c: pick(random, pool) }));

const SORTS: GridSortState[] = [
  [{ columnKey: 'a', direction: 'asc' }],
  [{ columnKey: 'a', direction: 'desc' }],
  [
    { columnKey: 'b', direction: 'asc' },
    { columnKey: 'a', direction: 'desc' },
  ],
  [
    { columnKey: 'c', direction: 'desc' },
    { columnKey: 'b', direction: 'desc' },
    { columnKey: 'a', direction: 'asc' },
  ],
];

// 行パイプライン(engine/rowPipeline の resolveSorted)と同じ手順で、前回の結果から今回の結果を作ります。
const incrementalSort = (
  prevRows: Row[],
  nextRows: Row[],
  order: RowOrder,
  sort: GridSortState,
  limit: number,
): { result: RowOrder; path: 'same' | 'reposition' | 'full' } => {
  const prevKeys = decorateSortKeys(prevRows, order, columns, sort);
  const nextKeys = decorateSortKeys(nextRows, order, columns, sort);
  if (prevKeys === null || nextKeys === null) {
    throw new Error('sort が空');
  }
  const prevPositions = sortPositionsByKeys(prevKeys, order);
  const changed = diffSortKeys(prevKeys, nextKeys, limit);
  if (changed === null) {
    return { result: undecorateSortedPositions(order, sortPositionsByKeys(nextKeys, order)), path: 'full' };
  }
  if (changed.length === 0) {
    return { result: undecorateSortedPositions(order, prevPositions), path: 'same' };
  }
  return {
    result: undecorateSortedPositions(order, repositionSortedPositions(prevPositions, changed, nextKeys, order)),
    path: 'reposition',
  };
};

describe('差分ソート(監査 B-10)', () => {
  it('sortOrder は decorate → 位置の並べ替え → undecorate と同じ結果(分割前と同じ規則)', () => {
    const rows: Row[] = [
      { a: 3, b: 'x', c: null },
      { a: null, b: 'y', c: 1 },
      { a: 1, b: 'x', c: 2 },
      { a: '2', b: '', c: 'q' },
      { a: 1, b: 'a', c: 2 },
    ];
    const order = createSourceOrder(rows.length);
    expect(Array.from(sortOrder(rows, order, columns, [{ columnKey: 'a', direction: 'asc' }]))).toEqual([2, 4, 3, 0, 1]);
    // 空値は降順でも末尾、同値は元の順。
    expect(Array.from(sortOrder(rows, order, columns, [{ columnKey: 'a', direction: 'desc' }]))).toEqual([0, 3, 2, 4, 1]);
    // 数値 < 文字列、空値は末尾(mixed 経路)。
    expect(Array.from(sortOrder(rows, order, columns, [{ columnKey: 'c', direction: 'asc' }]))).toEqual([1, 2, 4, 3, 0]);
    // sort が空 / 列が無いときは同じ参照。
    expect(sortOrder(rows, order, columns, [])).toBe(order);
    expect(sortOrder(rows, order, columns, [{ columnKey: 'zzz', direction: 'asc' }])).toBe(order);
  });

  it('ソート列のキーが変わらない編集では、キーの差分が 0 件(前回の結果をそのまま使える)', () => {
    const random = createRandom(7);
    const rows = makeRows(random, 200, VALUE_POOLS.numeric);
    const order = createSourceOrder(rows.length);
    const sort: GridSortState = [{ columnKey: 'a', direction: 'asc' }];
    // b / c だけを書き換えた新しい配列。
    const next = rows.map((row, i) => (i % 3 === 0 ? { ...row, b: 'edited', c: i } : row));
    const prevKeys = decorateSortKeys(rows, order, columns, sort);
    const nextKeys = decorateSortKeys(next, order, columns, sort);
    expect(prevKeys && nextKeys && diffSortKeys(prevKeys, nextKeys, 10)).toEqual([]);
    // 値が同じなら '2' と 2 のように型が違っても同じキー(並びに影響しない)。
    const sameValue = rows.map((row) => (row.a === 2 ? { ...row, a: '2' } : row));
    const sameValueKeys = decorateSortKeys(sameValue, order, columns, sort);
    expect(prevKeys && sameValueKeys && diffSortKeys(prevKeys, sameValueKeys, 10)).toEqual([]);
  });

  it('行オブジェクトをその場で書き換えても(参照が同じでも)キーの差分で気づく', () => {
    const rows: Row[] = [
      { a: 1, b: 0, c: 0 },
      { a: 2, b: 0, c: 0 },
      { a: 3, b: 0, c: 0 },
    ];
    const order = createSourceOrder(rows.length);
    const sort: GridSortState = [{ columnKey: 'a', direction: 'asc' }];
    const prevKeys = decorateSortKeys(rows, order, columns, sort);
    rows[0].a = 9;
    const nextKeys = decorateSortKeys(rows.slice(), order, columns, sort);
    expect(prevKeys && nextKeys && diffSortKeys(prevKeys, nextKeys, 10)).toEqual([0]);
  });

  it('列数や方向が違う decorate 結果どうしは比べない(null = 全件ソート)', () => {
    const rows = makeRows(createRandom(3), 20, VALUE_POOLS.numeric);
    const order = createSourceOrder(rows.length);
    const asc = decorateSortKeys(rows, order, columns, [{ columnKey: 'a', direction: 'asc' }]);
    const desc = decorateSortKeys(rows, order, columns, [{ columnKey: 'a', direction: 'desc' }]);
    const two = decorateSortKeys(rows, order, columns, SORTS[2]);
    expect(asc && desc && diffSortKeys(asc, desc, 100)).toBeNull();
    expect(asc && two && diffSortKeys(asc, two, 100)).toBeNull();
  });

  it('limit を超える件数が変わったら null(全件ソートへ)', () => {
    const rows = makeRows(createRandom(11), 50, VALUE_POOLS.numeric);
    const order = createSourceOrder(rows.length);
    const sort: GridSortState = [{ columnKey: 'a', direction: 'asc' }];
    const next = rows.map((row, i) => ({ ...row, a: i * 1000 }));
    const prevKeys = decorateSortKeys(rows, order, columns, sort);
    const nextKeys = decorateSortKeys(next, order, columns, sort);
    expect(prevKeys && nextKeys && diffSortKeys(prevKeys, nextKeys, 3)).toBeNull();
  });

  for (const [poolName, pool] of Object.entries(VALUE_POOLS)) {
    for (const [sortIndex, sort] of SORTS.entries()) {
      it(`乱数の編集で全件ソートと一致する(${poolName} / sort ${sortIndex})`, () => {
        const random = createRandom(1000 + sortIndex * 17 + poolName.length);
        let paths = { same: 0, reposition: 0, full: 0 };
        for (let trial = 0; trial < 60; trial += 1) {
          const count = 1 + Math.floor(random() * 80);
          const rows = makeRows(random, count, pool);
          // 入力の order は「フィルター済み」を模して一部を間引き、順序もばらばらにする。
          const source = Array.from(createSourceOrder(count)).filter(() => random() > 0.2);
          for (let i = source.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [source[i], source[j]] = [source[j], source[i]];
          }
          const order = Int32Array.from(source);
          // 0〜12 行を書き換える(別の種類の値へ = numeric ↔ mixed の切り替わりも起きる)。limit 2 を超えると全件ソート。
          const editCount = Math.floor(random() * 13);
          const next = rows.slice();
          for (let e = 0; e < editCount; e += 1) {
            const target = Math.floor(random() * count);
            const otherPool = random() < 0.3 ? VALUE_POOLS.mixed : pool;
            next[target] = { ...next[target], [['a', 'b', 'c'][Math.floor(random() * 3)]]: pick(random, otherPool) };
          }
          const expected = sortOrder(next, order, columns, sort);
          const actual = incrementalSort(rows, next, order, sort, 2);
          paths = { ...paths, [actual.path]: paths[actual.path] + 1 };
          expect(Array.from(actual.result)).toEqual(Array.from(expected));
        }
        // 3 つの経路すべてを通っていること(テストが差分経路を実際に検証している)。
        expect(paths.same).toBeGreaterThan(0);
        expect(paths.reposition).toBeGreaterThan(0);
        expect(paths.full).toBeGreaterThan(0);
      });
    }
  }
});