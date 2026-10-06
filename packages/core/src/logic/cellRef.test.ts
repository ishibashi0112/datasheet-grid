// 追加(G-1): セル操作の通知が渡すセル参照の解決(resolveGridCellRef)と同値判定(isSameGridCellRef)の契約テストです。
import { describe, it, expect } from 'vitest';
import type { GridColumn, GridGroupRow, GridLabelRow, RowModel } from '../model/gridTypes.unbound';
import { isSameGridCellRef, resolveGridCellRef } from './cellRef';
import { DETAIL_TOGGLE_COLUMN_KEY } from './detailRow';
import { GROUP_AUTO_COLUMN_KEY } from './grouping';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from './rowReorder';

type Row = { id: string; name: string; qty: number };

const rows: Row[] = [
  { id: 'a', name: 'alpha', qty: 1 },
  { id: 'b', name: 'beta', qty: 2 },
  { id: 'c', name: 'gamma', qty: 3 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 100 },
  { key: 'qty', title: '数量', width: 80, getValue: (row) => row.qty * 10 },
];

// order(view 順の source index)から clientSide 相当の RowModel を作ります。
const makeModel = (order: number[], extra: Partial<RowModel<Row>> = {}): RowModel<Row> => ({
  getRowCount: () => order.length,
  getRow: (i) => rows[order[i]],
  getSourceIndex: (i) => order[i],
  getRowKey: (i) => rows[order[i]]?.id,
  ...extra,
});

describe('resolveGridCellRef', () => {
  it('データセルを行データ + rowKey + view / source の index + 列 + 値へ解決する(getValue 列は戻り値)', () => {
    const ref = resolveGridCellRef(makeModel([2, 0, 1]), columns, { row: 0, col: 1 });
    expect(ref).toEqual({
      row: rows[2],
      rowKey: 'c',
      rowIndex: 0,
      sourceRowIndex: 2,
      column: columns[1],
      columnKey: 'qty',
      colIndex: 1,
      value: 30,
    });
    expect(ref?.row).toBe(rows[2]);
  });

  it('範囲外の行 / 列は null', () => {
    const model = makeModel([0, 1, 2]);
    expect(resolveGridCellRef(model, columns, { row: -1, col: 0 })).toBeNull();
    expect(resolveGridCellRef(model, columns, { row: 3, col: 0 })).toBeNull();
    expect(resolveGridCellRef(model, columns, { row: 0, col: 2 })).toBeNull();
  });

  it('SSRM の未ロード行(getRow が undefined)は null で、getRowKey を呼ばない', () => {
    let rowKeyCalls = 0;
    const model: RowModel<Row> = {
      getRowCount: () => 10,
      getRow: (i) => (i < 3 ? rows[i] : (undefined as unknown as Row)),
      getSourceIndex: (i) => i,
      getRowKey: (i) => {
        rowKeyCalls += 1;
        return rows[i].id;
      },
    };
    expect(resolveGridCellRef(model, columns, { row: 5, col: 0 })).toBeNull();
    expect(rowKeyCalls).toBe(0);
    expect(resolveGridCellRef(model, columns, { row: 1, col: 0 })?.rowKey).toBe('b');
  });

  it('グループ行 / ラベル行は null', () => {
    const groupModel = makeModel([0, 1, 2], {
      getGroupRow: (i) => (i === 0 ? ({ groupKey: 'g' } as unknown as GridGroupRow) : undefined),
    });
    expect(resolveGridCellRef(groupModel, columns, { row: 0, col: 0 })).toBeNull();
    expect(resolveGridCellRef(groupModel, columns, { row: 1, col: 0 })?.rowKey).toBe('b');

    const labelModel = makeModel([0, 1, 2], {
      getLabelRow: (i) => (i === 2 ? ({ kind: 'label' } as unknown as GridLabelRow<Row>) : undefined),
    });
    expect(resolveGridCellRef(labelModel, columns, { row: 2, col: 0 })).toBeNull();
    expect(resolveGridCellRef(labelModel, columns, { row: 1, col: 0 })?.rowKey).toBe('b');
  });

  it('合成列(自動グループ列 / 展開トグル列 / 行ドラッグハンドル列)は null', () => {
    const model = makeModel([0, 1, 2]);
    for (const key of [GROUP_AUTO_COLUMN_KEY, DETAIL_TOGGLE_COLUMN_KEY, ROW_DRAG_HANDLE_COLUMN_KEY]) {
      const withSynthetic: GridColumn<Row>[] = [{ key, title: '', width: 28 }, ...columns];
      expect(resolveGridCellRef(model, withSynthetic, { row: 0, col: 0 })).toBeNull();
      expect(resolveGridCellRef(model, withSynthetic, { row: 0, col: 1 })?.columnKey).toBe('name');
    }
  });
});

describe('isSameGridCellRef', () => {
  const model = makeModel([0, 1, 2]);
  const at = (row: number, col: number) => resolveGridCellRef(model, columns, { row, col });

  it('null 同士は同じ / 片方だけ null は別', () => {
    expect(isSameGridCellRef(null, null)).toBe(true);
    expect(isSameGridCellRef(at(0, 0), null)).toBe(false);
    expect(isSameGridCellRef(null, at(0, 0))).toBe(false);
  });

  it('行キー / 列キー / 位置が同じなら同じ(行データの中身の変化は見ない)', () => {
    const a = at(1, 0);
    const b = a && { ...a, row: { ...a.row, name: 'changed' }, value: 'changed' };
    expect(isSameGridCellRef(a, b)).toBe(true);
    expect(isSameGridCellRef(at(1, 0), at(1, 1))).toBe(false);
    expect(isSameGridCellRef(at(1, 0), at(2, 0))).toBe(false);
  });

  it('同じ座標でも行が入れ替わった(ソート等)なら別', () => {
    const before = resolveGridCellRef(makeModel([0, 1, 2]), columns, { row: 0, col: 0 });
    const after = resolveGridCellRef(makeModel([2, 1, 0]), columns, { row: 0, col: 0 });
    expect(isSameGridCellRef(before, after)).toBe(false);
  });
});