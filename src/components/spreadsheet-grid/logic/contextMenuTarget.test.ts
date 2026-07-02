import { describe, it, expect } from 'vitest';
import {
  resolveContextMenuColIndex,
  isContextMenuCellSelected,
  isContextMenuRowSelected,
} from './contextMenuTarget';
import type { GridColumn, GridSelection } from '../model/gridTypes';

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