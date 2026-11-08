// 追加(段階 2 DU-10): 小計の行の組み立て(祖先の値 / 自分の段の「<ラベル> 小計」/ 下の段は空 / 集計値)。
import { describe, it, expect } from 'vitest';
import { buildGroupTree, flattenGroupTree } from './grouping';
import { createGroupSubtotalLineGetter } from './groupExport';
import type { GridColumn } from '../model/gridTypes.unbound';

type Sale = { region: string | null; kind: string; rep: string; amount: number };
const columns: GridColumn<Sale>[] = [
  { key: 'region', title: '地域', width: 80, rowGroup: true },
  { key: 'kind', title: '区分', width: 80, rowGroup: true },
  { key: 'rep', title: '担当', width: 80 },
  { key: 'amount', title: '金額', width: 80, aggFunc: 'sum' },
];
const rows: Sale[] = [
  { region: '関東', kind: '法人', rep: '佐藤', amount: 100 },
  { region: '関東', kind: '個人', rep: '鈴木', amount: 200 },
  { region: null, kind: '法人', rep: '田中', amount: 300 },
];

describe('createGroupSubtotalLineGetter', () => {
  it('グループ行の index だけ小計の行を返し、データ行は undefined', () => {
    const tree = buildGroupTree(rows, Int32Array.from([0, 1, 2]), columns.slice(0, 2), [columns[3]]);
    const { displayOrder, groups } = flattenGroupTree(tree, new Set());
    const getLine = createGroupSubtotalLineGetter({
      order: displayOrder,
      groups,
      columns,
      groupColumnKeys: ['region', 'kind'],
    });
    const lines = Array.from(displayOrder, (_, index) => getLine(index));
    expect(lines).toEqual([
      ['関東 小計', undefined, undefined, 300],
      ['関東', '法人 小計', undefined, 100],
      undefined,
      ['関東', '個人 小計', undefined, 200],
      undefined,
      // 空白のグループはラベル「(空白)」、子の段の祖先の値は null(空のセル)。
      ['(空白) 小計', undefined, undefined, 300],
      [null, '法人 小計', undefined, 300],
      undefined,
    ]);
    expect(getLine(-1)).toBeUndefined();
    expect(getLine(displayOrder.length)).toBeUndefined();
  });

  it('グループ元の列を出さない並び(列の選び方が違う)でも、列の key で段を決める', () => {
    const tree = buildGroupTree(rows.slice(0, 1), Int32Array.from([0]), columns.slice(0, 2), [columns[3]]);
    const { displayOrder, groups } = flattenGroupTree(tree, new Set());
    const getLine = createGroupSubtotalLineGetter({
      order: displayOrder,
      groups,
      columns: [columns[3], columns[1]],
      groupColumnKeys: ['region', 'kind'],
    });
    expect(getLine(0)).toEqual([100, undefined]);
    expect(getLine(1)).toEqual([100, '法人 小計']);
  });
});
