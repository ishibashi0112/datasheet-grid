// 追加(F-2 / セル内検索): 純粋ロジックのテストです。
import { describe, expect, it } from 'vitest';
import {
  buildFindIndex,
  findRangesInText,
  resolveCurrentAfterRescan,
  resolveFindCellText,
  splitTextByFindRanges,
  stepFindIndex,
  type FindMatch,
} from './find';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { name: string; qty: number | null };

describe('findRangesInText', () => {
  it('大文字小文字を無視した部分一致で、重ならない全出現位置を返す', () => {
    expect(findRangesInText('電子部品 部品', '部品', false)).toEqual([
      { start: 2, length: 2 },
      { start: 5, length: 2 },
    ]);
    expect(findRangesInText('Alpha ALPHA', 'alpha', false)).toEqual([
      { start: 0, length: 5 },
      { start: 6, length: 5 },
    ]);
    expect(findRangesInText('Alpha ALPHA', 'alpha', true)).toEqual([]);
    expect(findRangesInText('aaaa', 'aa', false)).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 2 },
    ]);
    expect(findRangesInText('abc', '', false)).toEqual([]);
  });
});

describe('resolveFindCellText', () => {
  it('valueFormatter 適用後の文字列(未指定は String、null は空)', () => {
    const plain: GridColumn<Row> = { key: 'qty', title: 'Qty', width: 80 };
    const formatted: GridColumn<Row> = { key: 'qty', title: 'Qty', width: 80, valueFormatter: ({ value }) => `${value}個` };
    expect(resolveFindCellText(plain, { name: 'a', qty: 12 })).toBe('12');
    expect(resolveFindCellText(plain, { name: 'a', qty: null })).toBe('');
    expect(resolveFindCellText(formatted, { name: 'a', qty: 12 })).toBe('12個');
  });
});

describe('buildFindIndex / splitTextByFindRanges', () => {
  it('rowIndex → colIndex → 範囲(通し番号付き)を引け、文字列を分割できる', () => {
    const matches: FindMatch[] = [
      { rowIndex: 0, colIndex: 1, columnKey: 'name', start: 2, length: 2 },
      { rowIndex: 0, colIndex: 1, columnKey: 'name', start: 5, length: 2 },
      { rowIndex: 3, colIndex: 0, columnKey: 'id', start: 0, length: 1 },
    ];
    const index = buildFindIndex(matches);
    const ranges = index.get(0)?.get(1);
    expect(ranges).toEqual([
      { start: 2, length: 2, matchIndex: 0 },
      { start: 5, length: 2, matchIndex: 1 },
    ]);
    expect(index.get(3)?.get(0)?.[0].matchIndex).toBe(2);
    expect(index.get(1)).toBeUndefined();
    expect(splitTextByFindRanges('電子部品 部品', ranges!)).toEqual([
      { text: '電子', range: null },
      { text: '部品', range: ranges![0] },
      { text: ' ', range: null },
      { text: '部品', range: ranges![1] },
    ]);
  });
});

describe('resolveCurrentAfterRescan / stepFindIndex', () => {
  it('再走査後は同じヒットを保ち、無ければ先頭。順送りは循環する', () => {
    const matches: FindMatch[] = [
      { rowIndex: 0, colIndex: 0, columnKey: 'a', start: 0, length: 1 },
      { rowIndex: 2, colIndex: 1, columnKey: 'b', start: 3, length: 1 },
    ];
    expect(resolveCurrentAfterRescan(matches, matches[1])).toBe(1);
    expect(resolveCurrentAfterRescan(matches, { rowIndex: 9, colIndex: 9, columnKey: 'x', start: 0, length: 1 })).toBe(0);
    expect(resolveCurrentAfterRescan([], matches[0])).toBeNull();
    expect(stepFindIndex(null, 3, 1)).toBe(0);
    expect(stepFindIndex(null, 3, -1)).toBe(2);
    expect(stepFindIndex(2, 3, 1)).toBe(0);
    expect(stepFindIndex(0, 3, -1)).toBe(2);
    expect(stepFindIndex(0, 0, 1)).toBeNull();
  });
});
