// 追加(clear): logic/clearCells.ts(選択セルの値クリア)の単体テストです。
import { describe, it, expect } from 'vitest';
import { clearCellsInSelection, resolveClearTarget } from './clearCells';
import type { GridColumn } from '../model/gridTypes';

type Row = { id: number; name: string; qty: number | string | null };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];

const makeRows = (): Row[] => [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

// 恒等 view→source(フィルター/ソートなし)です。
const identity = (viewIndex: number) => viewIndex;
const allowAll = () => true;

describe('resolveClearTarget', () => {
  it('cell selection は正規化 + ビューへクランプする', () => {
    expect(
      resolveClearTarget(
        { type: 'cell', range: { start: { row: 2, col: 2 }, end: { row: 0, col: 1 } } },
        null,
        2,
        3,
      ),
    ).toEqual({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 });
  });

  it('row selection は全列、col selection は全ビュー行に展開する', () => {
    expect(resolveClearTarget({ type: 'row', startRow: 1, endRow: 2 }, null, 3, 3))
      .toEqual({ startRow: 1, endRow: 2, startCol: 0, endCol: 2 });
    expect(resolveClearTarget({ type: 'col', startCol: 1, endCol: 1 }, null, 3, 3))
      .toEqual({ startRow: 0, endRow: 2, startCol: 1, endCol: 1 });
  });

  it('selection が無ければ activeCell 単一セル(範囲外は null)', () => {
    expect(resolveClearTarget(null, { row: 1, col: 2 }, 3, 3)).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 2,
      endCol: 2,
    });
    expect(resolveClearTarget(null, { row: 5, col: 0 }, 3, 3)).toBeNull();
    expect(resolveClearTarget(null, null, 3, 3)).toBeNull();
  });

  it('空ビュー / 空列では null', () => {
    expect(resolveClearTarget({ type: 'row', startRow: 0, endRow: 0 }, null, 0, 3)).toBeNull();
    expect(resolveClearTarget(null, { row: 0, col: 0 }, 3, 0)).toBeNull();
  });
});

describe('clearCellsInSelection', () => {
  it('セル範囲の値を空文字にクリアし、対象外の行は参照を保つ', () => {
    const rows = makeRows();
    const { nextRows, changed } = clearCellsInSelection({
      rows,
      resolveSourceIndex: identity,
      columns,
      selection: {
        type: 'cell',
        range: { start: { row: 0, col: 1 }, end: { row: 1, col: 2 } },
      },
      activeCell: null,
      viewRowCount: 3,
      canWriteCell: allowAll,
    });
    expect(changed).toBe(true);
    expect(nextRows[0]).toEqual({ id: 1, name: '', qty: '' });
    expect(nextRows[1]).toEqual({ id: 2, name: '', qty: '' });
    // 範囲外の行 2 は参照そのまま(構造共有)。
    expect(nextRows[2]).toBe(rows[2]);
    expect(rows[0].name).toBe('alpha');
  });

  it('canWriteCell=false のセルはクリアしない', () => {
    const rows = makeRows();
    const { nextRows, changed } = clearCellsInSelection({
      rows,
      resolveSourceIndex: identity,
      columns,
      selection: {
        type: 'cell',
        range: { start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
      },
      activeCell: null,
      viewRowCount: 3,
      // id 列(colIndex 0)は編集不可扱い。
      canWriteCell: (_r, colIndex) => colIndex !== 0,
    });
    expect(changed).toBe(true);
    expect(nextRows[0]).toEqual({ id: 1, name: '', qty: '' });
  });

  it('parseClipboardValue があれば空文字をそれに通した値でクリアする', () => {
    const parsingColumns: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'name', title: 'Name', width: 160 },
      {
        key: 'qty',
        title: 'Qty',
        width: 100,
        parseClipboardValue: (raw) => (raw === '' ? null : Number(raw)),
      },
    ];
    const rows = makeRows();
    const { nextRows } = clearCellsInSelection({
      rows,
      resolveSourceIndex: identity,
      columns: parsingColumns,
      selection: null,
      activeCell: { row: 0, col: 2 },
      viewRowCount: 3,
      canWriteCell: allowAll,
    });
    expect(nextRows[0].qty).toBeNull();
  });

  it('全セルが既にクリア値なら changed=false で rows 参照をそのまま返す', () => {
    const rows: Row[] = [{ id: 1, name: '', qty: '' }];
    const result = clearCellsInSelection({
      rows,
      resolveSourceIndex: identity,
      columns,
      selection: {
        type: 'cell',
        range: { start: { row: 0, col: 1 }, end: { row: 0, col: 2 } },
      },
      activeCell: null,
      viewRowCount: 1,
      canWriteCell: allowAll,
    });
    expect(result.changed).toBe(false);
    expect(result.nextRows).toBe(rows);
  });

  it('view→source 解決を通してソート/フィルター後のビュー座標で正しい行をクリアする', () => {
    const rows = makeRows();
    // ビューは逆順(view 0 = source 2)という想定です。
    const reversed = (viewIndex: number) => 2 - viewIndex;
    const { nextRows } = clearCellsInSelection({
      rows,
      resolveSourceIndex: reversed,
      columns,
      selection: null,
      activeCell: { row: 0, col: 1 },
      viewRowCount: 3,
      canWriteCell: allowAll,
    });
    expect(nextRows[2].name).toBe('');
    expect(nextRows[0]).toBe(rows[0]);
  });

  it('resolveSourceIndex が undefined(OOB)の行は skip する', () => {
    const rows = makeRows();
    const { nextRows, changed } = clearCellsInSelection({
      rows,
      resolveSourceIndex: (viewIndex) => (viewIndex === 0 ? 0 : undefined),
      columns,
      selection: { type: 'col', startCol: 1, endCol: 1 },
      activeCell: null,
      viewRowCount: 3,
      canWriteCell: allowAll,
    });
    expect(changed).toBe(true);
    expect(nextRows[0].name).toBe('');
    expect(nextRows[1]).toBe(rows[1]);
    expect(nextRows[2]).toBe(rows[2]);
  });
});