// 行ドラッグの「どの行を掴んだか」「ゴーストに何を出すか」「どこへ落とせるか」(1.3.0 / 段 2-9 で React 版と Solid 版から寄せた)。
import { describe, expect, it, vi } from 'vitest';
import { createRowDropCheck, getDragRowToken, locateDragRowToken, resolveRowDragLabel } from './rowDragTarget';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; name: string; photo?: string; done?: boolean };

const modelOf = (rows: Row[]): RowModel<Row> => ({
  getRowCount: () => rows.length,
  getRow: (index) => rows[index] as Row,
  getSourceIndex: (index) => index,
  getRowKey: (index) => rows[index]?.id ?? index,
});

describe('resolveRowDragLabel', () => {
  const rows: Row[] = [{ id: 1, name: 'りんご', photo: 'a.png', done: true }, { id: 2, name: '  ' }];
  it('文字を出さない列(合成列 / renderCell だけの列 / チェックボックス / 数字を出さないデータバー)を飛ばす', () => {
    const columns: GridColumn<Row>[] = [
      { key: '__ssg_row_drag_handle__', width: 28 },
      { key: 'photo', width: 40, renderCell: () => null },
      { key: 'done', width: 40, editor: { type: 'checkbox' } },
      { key: 'name', width: 80 },
    ];
    expect(resolveRowDragLabel(modelOf(rows), columns, 0, '行 {row}')).toBe('りんご');
  });
  it('valueFormatter があれば renderCell の列でも使う', () => {
    const columns: GridColumn<Row>[] = [
      { key: 'photo', width: 40, renderCell: () => null, valueFormatter: ({ value }) => `画像 ${String(value)}` },
    ];
    expect(resolveRowDragLabel(modelOf(rows), columns, 0, '行 {row}')).toBe('画像 a.png');
  });
  it('空白だけ / 列が無い / 行が無いときは「行 N」', () => {
    const columns: GridColumn<Row>[] = [{ key: 'name', width: 80 }];
    expect(resolveRowDragLabel(modelOf(rows), columns, 1, '行 {row}')).toBe('行 2');
    expect(resolveRowDragLabel(modelOf(rows), [], 0, 'Row {row}')).toBe('Row 1');
    expect(resolveRowDragLabel(modelOf(rows), columns, 5, '行 {row}')).toBe('行 6');
  });
});

describe('createRowDropCheck', () => {
  const rows: Row[] = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }];
  it('canDropRow が無ければ undefined', () => {
    expect(createRowDropCheck<Row>(undefined, rows, (row) => row.id)).toBeUndefined();
  });
  it('スロットを動かした後の位置と、落とした後のすぐ上 / 下の行で聞く', () => {
    const canDropRow = vi.fn(() => true);
    const check = createRowDropCheck<Row>(canDropRow, rows, (row) => row.id);
    expect(check?.(0, 3)).toBe(true);
    expect(canDropRow).toHaveBeenLastCalledWith({
      row: rows[0],
      rowKey: 1,
      fromIndex: 0,
      toIndex: 2,
      rowAbove: rows[2],
      rowBelow: undefined,
      rows,
    });
    // 動かない位置(掴んだ行のすぐ上 / 下の境界)は聞かずに false。
    canDropRow.mockClear();
    expect(check?.(1, 1)).toBe(false);
    expect(check?.(1, 2)).toBe(false);
    expect(canDropRow).not.toHaveBeenCalled();
  });
});

describe('getDragRowToken / locateDragRowToken', () => {
  const a: Row = { id: 1, name: 'a' };
  const b: Row = { id: 2, name: 'b' };
  const c: Row = { id: 3, name: 'c' };
  it('行の参照で探し直す(並びが変わったら新しい位置)', () => {
    const token = getDragRowToken(modelOf([a, b, c]), 1);
    expect(locateDragRowToken(modelOf([a, b, c]), false, token, 1)).toBe(1);
    expect(locateDragRowToken(modelOf([b, a, c]), false, token, 1)).toBe(0);
  });
  it('参照が変わったら行のキーがあるときだけキーで探し、無ければやめる', () => {
    const token = getDragRowToken(modelOf([a, b, c]), 1);
    const remade = [{ ...a }, { ...c }, { ...b }];
    expect(locateDragRowToken(modelOf(remade), true, token, 1)).toBe(2);
    expect(locateDragRowToken(modelOf([{ ...a }, { ...c }]), true, token, 1)).toBeNull();
  });
  it('キーが無いときは行数が同じなら掴んだときの位置、変われば null', () => {
    const token = getDragRowToken(modelOf([a, b, c]), 1);
    expect(locateDragRowToken(modelOf([{ ...a }, { ...b }, { ...c }]), false, token, 1)).toBe(1);
    expect(locateDragRowToken(modelOf([{ ...a }, { ...b }]), false, token, 1)).toBeNull();
  });
  it('行が無い位置は控えない', () => {
    expect(getDragRowToken(modelOf([a]), 3)).toBeNull();
  });
});