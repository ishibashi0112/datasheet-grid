// serverSideQuery(query 構築 / queryKey 直列化)の純ロジックテストです(stage ②)。
//   - buildServerSideQuery: 空入力の省略 / globalText trim / 無効フィルター除外 / sort 反映。
//   - serializeServerSideQuery: 空 query の安定ベースライン / 列キー挿入順非依存 / sort 順序依存 /
//     差異検出 / 往復安定(同一論理 query は同一文字列)。
import { describe, it, expect } from 'vitest';
import type {
  ColumnFilterValue,
} from '../model/gridTypes';
import {
  buildServerSideQuery,
  serializeServerSideQuery,
} from './serverSideQuery';

const numberGt5: ColumnFilterValue = {
  kind: 'number',
  raw: '>5',
  parsed: { mode: 'comparison', operator: '>', value: 5 },
};
const textFoo: ColumnFilterValue = { kind: 'text', value: 'foo' };
const emptyText: ColumnFilterValue = { kind: 'text', value: '   ' };
const setExclude: ColumnFilterValue = {
  kind: 'set',
  mode: 'exclude',
  values: ['保留'],
};

describe('buildServerSideQuery', () => {
  it('全て空なら空 query {} を返す(キー自体を省く)', () => {
    const query = buildServerSideQuery({
      globalText: '',
      columnFilters: {},
      sort: [],
    });
    expect(query).toEqual({});
  });

  it('globalText は trim して載せ、空白のみは省く', () => {
    expect(
      buildServerSideQuery({
        globalText: '  abc ',
        columnFilters: {},
        sort: [],
      }),
    ).toEqual({ globalText: 'abc' });

    expect(
      buildServerSideQuery({
        globalText: '   ',
        columnFilters: {},
        sort: [],
      }),
    ).toEqual({});
  });

  it('無効な列フィルター(空 text)は除外し、有効なものだけ収集する', () => {
    const query = buildServerSideQuery({
      globalText: '',
      columnFilters: { qty: numberGt5, partName: emptyText, status: setExclude },
      sort: [],
    });
    // emptyText は除外。qty / status のみ。
    expect(query.columnFilters).toEqual({ qty: numberGt5, status: setExclude });
    expect(query.globalText).toBeUndefined();
    expect(query.sort).toBeUndefined();
  });

  it('有効フィルターが 0 件なら columnFilters キー自体を省く', () => {
    const query = buildServerSideQuery({
      globalText: '',
      columnFilters: { partName: emptyText },
      sort: [],
    });
    expect(query).toEqual({});
  });

  it('sort は非空のときだけ載せる', () => {
    const query = buildServerSideQuery({
      globalText: '',
      columnFilters: {},
      sort: [{ columnKey: 'qty', direction: 'desc' }],
    });
    expect(query).toEqual({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
  });

  it('3 種そろったときは全て載せる', () => {
    const query = buildServerSideQuery({
      globalText: 'x',
      columnFilters: { qty: numberGt5 },
      sort: [{ columnKey: 'partName', direction: 'asc' }],
    });
    expect(query).toEqual({
      globalText: 'x',
      columnFilters: { qty: numberGt5 },
      sort: [{ columnKey: 'partName', direction: 'asc' }],
    });
  });
});

describe('serializeServerSideQuery', () => {
  it('空 query は安定したベースライン文字列を返す', () => {
    const key = serializeServerSideQuery({});
    expect(key).toBe(serializeServerSideQuery({}));
    // globalText:'' / sort:[] / columnFilters:{} を表す決定的な形。
    expect(key).toBe(JSON.stringify({ g: '', s: [], c: [] }));
  });

  it('列フィルターのキー挿入順に依存しない(昇順正規化)', () => {
    const a: Record<string, ColumnFilterValue> = {};
    a.qty = numberGt5;
    a.partName = textFoo;

    const b: Record<string, ColumnFilterValue> = {};
    b.partName = textFoo;
    b.qty = numberGt5;

    expect(serializeServerSideQuery({ columnFilters: a })).toBe(
      serializeServerSideQuery({ columnFilters: b }),
    );
  });

  it('フィルター内容が変われば queryKey も変わる', () => {
    const base = serializeServerSideQuery({ columnFilters: { qty: numberGt5 } });
    const changed = serializeServerSideQuery({
      columnFilters: {
        qty: {
          kind: 'number',
          raw: '>6',
          parsed: { mode: 'comparison', operator: '>', value: 6 },
        },
      },
    });
    expect(changed).not.toBe(base);
  });

  it('sort は順序(優先順位)を区別する', () => {
    const ab = serializeServerSideQuery({
      sort: [
        { columnKey: 'a', direction: 'asc' },
        { columnKey: 'b', direction: 'desc' },
      ],
    });
    const ba = serializeServerSideQuery({
      sort: [
        { columnKey: 'b', direction: 'desc' },
        { columnKey: 'a', direction: 'asc' },
      ],
    });
    expect(ab).not.toBe(ba);
  });

  it('globalText が反映される', () => {
    const withText = serializeServerSideQuery({ globalText: 'hello' });
    const empty = serializeServerSideQuery({});
    expect(withText).not.toBe(empty);
    expect(withText).toContain('hello');
  });

  it('build → serialize: 同一論理状態(挿入順違い)は同一 queryKey になる', () => {
    const q1 = buildServerSideQuery({
      globalText: ' term ',
      columnFilters: { qty: numberGt5, status: setExclude },
      sort: [{ columnKey: 'qty', direction: 'asc' }],
    });
    // 列フィルターの指定順を入れ替えただけの同一論理状態。
    const q2 = buildServerSideQuery({
      globalText: 'term',
      columnFilters: { status: setExclude, qty: numberGt5 },
      sort: [{ columnKey: 'qty', direction: 'asc' }],
    });
    expect(serializeServerSideQuery(q1)).toBe(serializeServerSideQuery(q2));
  });

  it('build → serialize: 有効フィルターの有無で queryKey が変わる', () => {
    const withFilter = serializeServerSideQuery(
      buildServerSideQuery({
        globalText: '',
        columnFilters: { qty: numberGt5 },
        sort: [],
      }),
    );
    // emptyText のみ = 実質フィルターなし → 空 query と同一キー。
    const effectivelyEmpty = serializeServerSideQuery(
      buildServerSideQuery({
        globalText: '',
        columnFilters: { partName: emptyText },
        sort: [],
      }),
    );
    expect(effectivelyEmpty).toBe(serializeServerSideQuery({}));
    expect(withFilter).not.toBe(effectivelyEmpty);
  });
});