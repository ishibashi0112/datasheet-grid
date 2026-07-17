// grouping ①: グループツリー構築(buildGroupTree)と開閉適用 flatten(flattenGroupTree)の
//   仕様テストです。要点:
//     - グループ順は入力 order 上の初出順、同値の不連続 leaf も 1 グループへ集約。
//     - bucket は型タグ付き文字列(数値 1 と文字列 '1' は別グループ、空値は「(空白)」へ集約)。
//     - displayOrder のエンコード(>= 0 = source index / < 0 = groups index)。
//     - collapsed は「グループ行自身は表示・配下は非表示」。
import { describe, it, expect } from 'vitest';
import {
  GROUP_EMPTY_LABEL,
  GROUP_ROW_KEY_PREFIX,
  buildGroupTree,
  collectAllGroupKeys,
  collectGroupingColumns,
  flattenGroupTree,
  groupIndexOfOrderValue,
  groupRowKey,
  isGroupOrderValue,
} from './grouping';
import { createSourceOrder } from './filtering';
import type { GridColumn, GridGroupRow } from '../model/gridTypes';

type Row = Record<string, unknown>;

const col = (key: string, extra?: Partial<GridColumn<Row>>): GridColumn<Row> => ({
  key,
  width: 100,
  ...extra,
});

// 2 階層(region → rep)の基本データです。関東/佐藤 が order 上で不連続になるよう並べています。
const ROWS: Row[] = [
  { region: '関東', rep: '佐藤', qty: 10, amt: 100 }, // 0
  { region: '関西', rep: '田中', qty: 20, amt: 200 }, // 1
  { region: '関東', rep: '高橋', qty: 30, amt: 300 }, // 2
  { region: '関東', rep: '佐藤', qty: 40, amt: 400 }, // 3
  { region: '関西', rep: '田中', qty: 50, amt: 500 }, // 4
];

const REGION = col('region', { rowGroup: true });
const REP = col('rep', { rowGroup: true });
const QTY = col('qty', { aggFunc: 'sum' });
const AMT = col('amt', { aggFunc: 'avg' });

// flatten 結果を「ラベル or source index」の配列へ落とすヘルパです(期待値の可読化)。
const describeDisplay = (
  displayOrder: Int32Array,
  groups: GridGroupRow[],
): (string | number)[] =>
  Array.from(displayOrder, (value) =>
    isGroupOrderValue(value)
      ? `${'>'.repeat(groups[groupIndexOfOrderValue(value)].level + 1)}${groups[groupIndexOfOrderValue(value)].label}`
      : value,
  );

describe('collectGroupingColumns', () => {
  it('rowGroup 列(出現順)と aggFunc 列を取り出す', () => {
    const columns = [QTY, REGION, col('memo'), REP, AMT];
    const { groupColumns, aggColumns } = collectGroupingColumns(columns);
    expect(groupColumns.map((c) => c.key)).toEqual(['region', 'rep']);
    expect(aggColumns.map((c) => c.key)).toEqual(['qty', 'amt']);
  });
});

describe('buildGroupTree', () => {
  it('初出順のグループ階層を構築し、不連続な同値 leaf を 1 グループへ集約する', () => {
    const tree = buildGroupTree(
      ROWS,
      createSourceOrder(ROWS.length),
      [REGION, REP],
      [],
    );
    expect(tree.roots.map((n) => n.groupRow.label)).toEqual(['関東', '関西']);
    expect(tree.groupCount).toBe(5); // 関東 / 関西 + 佐藤 / 高橋 / 田中
    const kanto = tree.roots[0];
    expect(kanto.groupRow.level).toBe(0);
    expect(kanto.groupRow.leafCount).toBe(3);
    expect(kanto.children.map((n) => n.groupRow.label)).toEqual([
      '佐藤',
      '高橋',
    ]);
    // 不連続だった 関東/佐藤(source 0 と 3)が 1 ノードに集約される。
    expect(kanto.children[0].leafSourceIndexes).toEqual([0, 3]);
    expect(kanto.children[0].groupRow.leafCount).toBe(2);
    // 最下層でないノードは leaf を直接持たない。
    expect(kanto.leafSourceIndexes).toEqual([]);
  });

  it('入力 order の並びがグループの初出順に反映される(ソートとの合成)', () => {
    // 関西の行を先頭にした order。
    const order = Int32Array.from([1, 4, 0, 2, 3]);
    const tree = buildGroupTree(ROWS, order, [REGION], []);
    expect(tree.roots.map((n) => n.groupRow.label)).toEqual(['関西', '関東']);
  });

  it('組み込み集計が全階層で確定する', () => {
    const tree = buildGroupTree(
      ROWS,
      createSourceOrder(ROWS.length),
      [REGION, REP],
      [QTY, AMT],
    );
    const kanto = tree.roots[0];
    expect(kanto.groupRow.aggregates).toEqual({ qty: 80, amt: (100 + 300 + 400) / 3 });
    const sato = kanto.children[0];
    expect(sato.groupRow.aggregates).toEqual({ qty: 50, amt: 250 });
  });

  it('カスタム集計関数へ values / rows / column が渡り、返り値が aggregates に載る', () => {
    const calls: { values: unknown[]; rowCount: number; columnKey: string }[] =
      [];
    const rangeColumn = col('qty', {
      aggFunc: ({ values, rows, column }) => {
        calls.push({ values, rowCount: rows.length, columnKey: column.key });
        const numbers = values.map(Number);
        return Math.max(...numbers) - Math.min(...numbers);
      },
    });
    const tree = buildGroupTree(
      ROWS,
      createSourceOrder(ROWS.length),
      [REGION],
      [rangeColumn],
    );
    expect(tree.roots[0].groupRow.aggregates).toEqual({ qty: 30 }); // 関東: 40 - 10
    expect(tree.roots[1].groupRow.aggregates).toEqual({ qty: 30 }); // 関西: 50 - 20
    expect(calls).toEqual([
      { values: [10, 30, 40], rowCount: 3, columnKey: 'qty' },
      { values: [20, 50], rowCount: 2, columnKey: 'qty' },
    ]);
  });

  it('不正な aggFunc 文字列は集計をスキップする(aggregates に載らない)', () => {
    const broken = col('qty', {
      aggFunc: 'median' as unknown as 'sum',
    });
    const tree = buildGroupTree(
      ROWS,
      createSourceOrder(ROWS.length),
      [REGION],
      [broken],
    );
    expect(tree.roots[0].groupRow.aggregates).toEqual({});
  });

  it('空値(null / undefined / 空文字)は 1 つの「(空白)」グループへ集約される', () => {
    const rows: Row[] = [
      { region: null, qty: 1 },
      { region: '', qty: 2 },
      { qty: 3 }, // region undefined
      { region: '関東', qty: 4 },
    ];
    const tree = buildGroupTree(
      rows,
      createSourceOrder(rows.length),
      [REGION],
      [],
    );
    expect(tree.roots.map((n) => n.groupRow.label)).toEqual([
      GROUP_EMPTY_LABEL,
      '関東',
    ]);
    expect(tree.roots[0].groupRow.value).toBeNull();
    expect(tree.roots[0].groupRow.leafCount).toBe(3);
  });

  it('数値 1 と文字列 "1" は別グループになる(型タグ付き bucket)', () => {
    const rows: Row[] = [{ region: 1 }, { region: '1' }, { region: 1 }];
    const tree = buildGroupTree(
      rows,
      createSourceOrder(rows.length),
      [REGION],
      [],
    );
    expect(tree.roots).toHaveLength(2);
    expect(tree.roots[0].groupRow.leafCount).toBe(2);
    expect(tree.roots[1].groupRow.leafCount).toBe(1);
    expect(tree.roots[0].groupRow.groupKey).not.toBe(
      tree.roots[1].groupRow.groupKey,
    );
  });

  it('rows が空なら空ツリーを返す', () => {
    const tree = buildGroupTree([], createSourceOrder(0), [REGION], [QTY]);
    expect(tree.roots).toEqual([]);
    expect(tree.groupCount).toBe(0);
  });
});

describe('flattenGroupTree', () => {
  const tree = buildGroupTree(
    ROWS,
    createSourceOrder(ROWS.length),
    [REGION, REP],
    [],
  );

  it('全展開時は DFS 順(グループ行 → 配下)で並ぶ', () => {
    const { displayOrder, groups } = flattenGroupTree(tree, new Set());
    expect(describeDisplay(displayOrder, groups)).toEqual([
      '>関東',
      '>>佐藤',
      0,
      3,
      '>>高橋',
      2,
      '>関西',
      '>>田中',
      1,
      4,
    ]);
    // エンコード: 負値は groups の index(-値 - 1)を指す。
    expect(isGroupOrderValue(displayOrder[0])).toBe(true);
    expect(groups[groupIndexOfOrderValue(displayOrder[0])].label).toBe('関東');
    expect(isGroupOrderValue(displayOrder[2])).toBe(false);
  });

  it('最上位を collapsed にすると配下(子グループ + leaf)が消え、グループ行自身は残る', () => {
    const kantoKey = tree.roots[0].groupRow.groupKey;
    const { displayOrder, groups } = flattenGroupTree(tree, new Set([kantoKey]));
    expect(describeDisplay(displayOrder, groups)).toEqual([
      '>関東',
      '>関西',
      '>>田中',
      1,
      4,
    ]);
  });

  it('子グループの collapsed はその leaf のみ隠す', () => {
    const satoKey = tree.roots[0].children[0].groupRow.groupKey;
    const { displayOrder, groups } = flattenGroupTree(tree, new Set([satoKey]));
    expect(describeDisplay(displayOrder, groups)).toEqual([
      '>関東',
      '>>佐藤',
      '>>高橋',
      2,
      '>関西',
      '>>田中',
      1,
      4,
    ]);
  });

  it('未知の collapsed キーは無視される(全展開と同じ)', () => {
    const { displayOrder } = flattenGroupTree(tree, new Set(['存在しないキー']));
    expect(displayOrder).toHaveLength(10);
  });
});

describe('補助 API', () => {
  it('collectAllGroupKeys は DFS 順で groupCount ぶんのキーを返す', () => {
    const tree = buildGroupTree(
      ROWS,
      createSourceOrder(ROWS.length),
      [REGION, REP],
      [],
    );
    const keys = collectAllGroupKeys(tree);
    expect(keys).toHaveLength(tree.groupCount);
    expect(new Set(keys).size).toBe(keys.length);
    // 親キーは子キーの接頭辞になる(階層パス連結)。
    expect(keys[1].startsWith(keys[0])).toBe(true);
  });

  it('groupRowKey は leaf の行キーと衝突しない接頭辞空間を持つ', () => {
    const tree = buildGroupTree(ROWS, createSourceOrder(ROWS.length), [REGION], []);
    const key = groupRowKey(tree.roots[0].groupRow);
    expect(typeof key).toBe('string');
    expect(String(key).startsWith(GROUP_ROW_KEY_PREFIX)).toBe(true);
  });
});