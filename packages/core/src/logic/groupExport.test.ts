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
    const lines = Array.from(displayOrder, (_, index) => getLine(index)?.values);
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
    expect(getLine(0)?.values).toEqual([100, undefined]);
    expect(getLine(1)?.values).toEqual([100, '法人 小計']);
    expect(getLine(1)?.texts).toEqual(['100', '法人 小計']);
  });

  // 修正(段階 2 の見直し): グループ元の列の文字はデータ行と同じ規則(列の formatClipboardValue)。row はグループの最初の行。
  it('texts はグループ元の列を formatClipboardValue で整え、空白のグループは「(空白) 小計」/ 空の祖先は列の規則どおり', () => {
    const formatted: GridColumn<Sale>[] = [
      { ...columns[0], formatClipboardValue: (value, row) => `${String(value ?? '-')}(${row.rep})` },
      { ...columns[1], formatClipboardValue: (value) => `<${String(value)}>` },
      columns[2],
      columns[3],
    ];
    const tree = buildGroupTree(rows, Int32Array.from([0, 1, 2]), formatted.slice(0, 2), [formatted[3]]);
    const { displayOrder, groups } = flattenGroupTree(tree, new Set());
    const getLine = createGroupSubtotalLineGetter({
      order: displayOrder,
      groups,
      columns: formatted,
      groupColumnKeys: ['region', 'kind'],
      getSourceRow: (sourceIndex) => rows[sourceIndex],
    });
    const texts = Array.from(displayOrder, (_, index) => getLine(index)?.texts);
    expect(texts).toEqual([
      ['関東(佐藤) 小計', '', '', '300'],
      ['関東(佐藤)', '<法人> 小計', '', '100'],
      undefined,
      ['関東(鈴木)', '<個人> 小計', '', '200'],
      undefined,
      ['(空白) 小計', '', '', '300'],
      ['-(田中)', '<法人> 小計', '', '300'],
      undefined,
    ]);
    // 代表の行が引けないとき(getSourceRow なし)は生の値の文字。
    const plain = createGroupSubtotalLineGetter({ order: displayOrder, groups, columns: formatted, groupColumnKeys: ['region', 'kind'] });
    expect(plain(1)?.texts).toEqual(['関東', '法人 小計', '', '100']);
  });
});
