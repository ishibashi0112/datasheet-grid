import { describe, it, expect } from 'vitest';
import {
  resolveContextMenuColIndex,
  isContextMenuCellSelected,
  isContextMenuRowSelected,
  buildBodyContextMenuParams,
  buildCellContextMenuParams,
} from './contextMenuTarget';
import type { GridColumn, GridSelection } from '../model/gridTypes.unbound';

type Row = { id: number };

const cols: GridColumn<Row>[] = [
  { key: 'a', width: 80 },
  { key: 'b', width: 80 },
  { key: 'c', width: 80 },
];

describe('resolveContextMenuColIndex', () => {
  it('列キーから論理列 index を返す', () => {
    expect(resolveContextMenuColIndex(cols, 'a')).toBe(0);
    expect(resolveContextMenuColIndex(cols, 'b')).toBe(1);
    expect(resolveContextMenuColIndex(cols, 'c')).toBe(2);
  });

  it('未知の列キーは -1', () => {
    expect(resolveContextMenuColIndex(cols, 'zzz')).toBe(-1);
  });

  it('空配列は常に -1', () => {
    expect(resolveContextMenuColIndex([], 'a')).toBe(-1);
  });
});

describe('isContextMenuCellSelected', () => {
  it('selection なしは false', () => {
    expect(isContextMenuCellSelected(null, 0, 0)).toBe(false);
  });

  it('cell 選択(矩形)の内外を判定する', () => {
    const sel: GridSelection = {
      type: 'cell',
      range: { start: { row: 1, col: 1 }, end: { row: 3, col: 2 } },
    };
    expect(isContextMenuCellSelected(sel, 2, 1)).toBe(true);
    expect(isContextMenuCellSelected(sel, 1, 2)).toBe(true);
    expect(isContextMenuCellSelected(sel, 0, 1)).toBe(false);
    expect(isContextMenuCellSelected(sel, 2, 3)).toBe(false);
  });

  it('cell 選択が逆順(end < start)でも min/max で吸収する', () => {
    const sel: GridSelection = {
      type: 'cell',
      range: { start: { row: 3, col: 2 }, end: { row: 1, col: 1 } },
    };
    expect(isContextMenuCellSelected(sel, 2, 2)).toBe(true);
    expect(isContextMenuCellSelected(sel, 0, 0)).toBe(false);
  });

  it('row 選択は行内の全列が選択扱い', () => {
    const sel: GridSelection = { type: 'row', startRow: 2, endRow: 4 };
    expect(isContextMenuCellSelected(sel, 3, 0)).toBe(true);
    expect(isContextMenuCellSelected(sel, 3, 99)).toBe(true);
    expect(isContextMenuCellSelected(sel, 1, 0)).toBe(false);
  });

  it('col 選択は列区間で判定(行に依らない)', () => {
    const sel: GridSelection = { type: 'col', startCol: 1, endCol: 2 };
    expect(isContextMenuCellSelected(sel, 999, 1)).toBe(true);
    expect(isContextMenuCellSelected(sel, 0, 2)).toBe(true);
    expect(isContextMenuCellSelected(sel, 0, 0)).toBe(false);
  });
});

describe('isContextMenuRowSelected', () => {
  it('selection なしは false', () => {
    expect(isContextMenuRowSelected(null, 0)).toBe(false);
  });

  it('row 選択は行区間で判定', () => {
    const sel: GridSelection = { type: 'row', startRow: 2, endRow: 4 };
    expect(isContextMenuRowSelected(sel, 2)).toBe(true);
    expect(isContextMenuRowSelected(sel, 4)).toBe(true);
    expect(isContextMenuRowSelected(sel, 5)).toBe(false);
  });

  it('cell 選択は行レンジで判定(列は無視)', () => {
    const sel: GridSelection = {
      type: 'cell',
      range: { start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
    };
    expect(isContextMenuRowSelected(sel, 2)).toBe(true);
    expect(isContextMenuRowSelected(sel, 0)).toBe(false);
  });

  it('col 選択は行対象ではないので常に false', () => {
    const sel: GridSelection = { type: 'col', startCol: 0, endCol: 5 };
    expect(isContextMenuRowSelected(sel, 3)).toBe(false);
  });
});
// 追加(1.3.0 / 段 2-9): params を作る処理(React 版と Solid 版から寄せた)。DOM は最小の偽物で足りる(closest / dataset だけ)。
describe('buildCellContextMenuParams / buildBodyContextMenuParams', () => {
  type ValueRow = { id: number; a: string; b: string; c: string };
  const valueRows: ValueRow[] = [{ id: 10, a: 'a0', b: 'b0', c: 'c0' }, { id: 11, a: 'a1', b: 'b1', c: 'c1' }];
  const rowModel = {
    getRowCount: () => valueRows.length,
    getRow: (index: number) => valueRows[index] as ValueRow,
    getSourceIndex: (index: number) => index,
    getRowKey: (index: number) => valueRows[index]?.id ?? index,
  };
  const valueCols: GridColumn<ValueRow>[] = [
    { key: 'a', width: 80 },
    { key: 'b', width: 80 },
    { key: 'c', width: 80 },
  ];
  const selection: GridSelection = { type: 'cell', range: { start: { row: 0, col: 1 }, end: { row: 1, col: 1 } } };
  // closest(selector) が対応する要素を返す偽物。
  const fakeTarget = (rowIndex: string | null, colKey: string | null) => {
    const rowEl = rowIndex === null ? null : { dataset: { rowIndex } };
    const cellEl = colKey === null ? null : { dataset: { ssgColKey: colKey } };
    return {
      closest: (selector: string) => (selector === '[data-row-index]' ? rowEl : selector === '[data-ssg-col-key]' ? cellEl : null),
    } as unknown as EventTarget;
  };

  it('セルの座標から cell の対象を作る', () => {
    const params = buildCellContextMenuParams({
      cell: { row: 1, col: 1 },
      clientX: 5,
      clientY: 6,
      rowModel,
      orderedColumns: valueCols,
      selection,
      activeCell: { row: 1, col: 1 },
    });
    expect(params?.target).toMatchObject({ type: 'cell', rowIndex: 1, colIndex: 1, rowKey: 11, value: 'b1' });
    expect(params?.isTargetSelected).toBe(true);
    expect(params?.clientX).toBe(5);
  });
  it('行か列が無ければ null', () => {
    const base = { clientX: 0, clientY: 0, rowModel, orderedColumns: valueCols, selection: null, activeCell: null };
    expect(buildCellContextMenuParams({ ...base, cell: { row: 5, col: 0 } })).toBeNull();
    expect(buildCellContextMenuParams({ ...base, cell: { row: 0, col: 9 } })).toBeNull();
  });
  it('右クリックの要素からセル / 行番号を見分ける', () => {
    const base = { rowModel, orderedColumns: valueCols, selection, activeCell: null };
    const cell = buildBodyContextMenuParams({ ...base, event: { target: fakeTarget('0', 'c'), clientX: 1, clientY: 2 } });
    expect(cell?.target).toMatchObject({ type: 'cell', rowIndex: 0, colIndex: 2, value: 'c0' });
    expect(cell?.isTargetSelected).toBe(false);
    const header = buildBodyContextMenuParams({ ...base, event: { target: fakeTarget('1', null), clientX: 1, clientY: 2 } });
    expect(header?.target).toMatchObject({ type: 'rowHeader', rowIndex: 1, rowKey: 11 });
    expect(header?.isTargetSelected).toBe(true);
  });
  it('見出し / 知らない列 / 行の無い位置 / 要素でない対象は null', () => {
    const base = { rowModel, orderedColumns: valueCols, selection, activeCell: null };
    const at = (target: EventTarget | null) => buildBodyContextMenuParams({ ...base, event: { target, clientX: 0, clientY: 0 } });
    expect(at(fakeTarget(null, 'a'))).toBeNull();
    expect(at(fakeTarget('0', 'zzz'))).toBeNull();
    expect(at(fakeTarget('9', 'a'))).toBeNull();
    expect(at(fakeTarget('x', 'a'))).toBeNull();
    expect(at(null)).toBeNull();
    expect(at({} as EventTarget)).toBeNull();
  });
});
