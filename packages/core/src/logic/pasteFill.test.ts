// 追加(1.2.0 / 2026-11-09 実アプリの総点検 A-08): 範囲いっぱいに繰り返す貼り付けの文字の作り方を固定します。
import { describe, expect, it } from 'vitest';
import { expandPasteMatrixToSelection } from './pasteFill';
import { DETAIL_TOGGLE_COLUMN_KEY } from './detailRow';
import type { GridColumn, GridGroupRow, GridSelection, RowModel } from '../model/gridTypes.unbound';

type Row = { a: string; b: string; c: string };
const columns: GridColumn<Row>[] = [
  { key: 'a', width: 80 },
  { key: 'b', width: 80 },
  { key: 'c', width: 80 },
];
const modelOf = (count: number, extra: Partial<RowModel<Row>> = {}): RowModel<Row> => ({
  getRowCount: () => count,
  getRow: () => ({ a: '', b: '', c: '' }),
  getSourceIndex: (index) => index,
  getRowKey: (index) => index,
  ...extra,
});
const cellRange = (r0: number, c0: number, r1: number, c1: number): GridSelection => ({
  type: 'cell',
  range: { start: { row: r0, col: c0 }, end: { row: r1, col: c1 } },
});

describe('expandPasteMatrixToSelection', () => {
  it('1 セルのコピーは範囲のデータのセルの数だけ繰り返す(逆向きの範囲も)', () => {
    expect(expandPasteMatrixToSelection([['x']], cellRange(2, 2, 0, 1), { row: 2, col: 2 }, modelOf(5), columns)).toEqual([
      ['x', 'x'],
      ['x', 'x'],
      ['x', 'x'],
    ]);
  });

  it('範囲がコピーの倍数なら繰り返し、割り切れなければ null(今までどおり 1 回)', () => {
    expect(
      expandPasteMatrixToSelection([['1', '2']], cellRange(0, 0, 1, 1), { row: 0, col: 0 }, modelOf(5), columns),
    ).toEqual([
      ['1', '2'],
      ['1', '2'],
    ]);
    expect(
      expandPasteMatrixToSelection([['1'], ['2']], cellRange(0, 0, 3, 0), { row: 0, col: 0 }, modelOf(5), columns),
    ).toEqual([['1'], ['2'], ['1'], ['2']]);
    expect(expandPasteMatrixToSelection([['1'], ['2']], cellRange(0, 0, 2, 0), { row: 0, col: 0 }, modelOf(5), columns)).toBeNull();
    expect(expandPasteMatrixToSelection([['1', '2']], cellRange(0, 0, 0, 2), { row: 0, col: 0 }, modelOf(5), columns)).toBeNull();
  });

  it('コピーと範囲が同じ大きさ・1 セルの選択・列 / 行の選択・範囲の外のアクティブセル・行ごとの列数が違う文字は null', () => {
    const model = modelOf(5);
    expect(expandPasteMatrixToSelection([['1', '2']], cellRange(0, 0, 0, 1), { row: 0, col: 0 }, model, columns)).toBeNull();
    expect(expandPasteMatrixToSelection([['1']], cellRange(1, 1, 1, 1), { row: 1, col: 1 }, model, columns)).toBeNull();
    expect(expandPasteMatrixToSelection([['1']], { type: 'col', startCol: 0, endCol: 0 }, { row: 0, col: 0 }, model, columns)).toBeNull();
    expect(expandPasteMatrixToSelection([['1']], { type: 'row', startRow: 0, endRow: 1 }, { row: 0, col: 0 }, model, columns)).toBeNull();
    expect(expandPasteMatrixToSelection([['1']], cellRange(0, 0, 1, 1), { row: 4, col: 2 }, model, columns)).toBeNull();
    expect(expandPasteMatrixToSelection([['1', '2'], ['3']], cellRange(0, 0, 3, 1), { row: 0, col: 0 }, model, columns)).toBeNull();
  });

  it('ラベル行・グループ行と合成列は数えない(貼り付けが飛ばすので、繰り返しはデータのセルにちょうど収まる)', () => {
    const grouped = modelOf(5, {
      getGroupRow: (index) => (index === 1 ? ({ groupKey: 'g' } as GridGroupRow) : undefined),
    });
    const withToggle: GridColumn<Row>[] = [{ key: DETAIL_TOGGLE_COLUMN_KEY, width: 28 }, ...columns];
    expect(expandPasteMatrixToSelection([['x']], cellRange(0, 0, 3, 2), { row: 0, col: 0 }, grouped, withToggle)).toEqual([
      ['x', 'x'],
      ['x', 'x'],
      ['x', 'x'],
    ]);
  });

  it('繰り返した行は同じ配列を共有する(大きな範囲でも行ごとに作り直さない)', () => {
    const tiled = expandPasteMatrixToSelection([['x']], cellRange(0, 0, 99, 0), { row: 0, col: 0 }, modelOf(100), columns);
    expect(tiled).toHaveLength(100);
    expect(tiled?.[0]).toBe(tiled?.[99]);
  });
});
