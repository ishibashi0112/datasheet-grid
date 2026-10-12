// 追加(フィルハンドル 1A): 埋める範囲(向き・合成列・表の端・ダブルクリック)と書き込み(編集可否・reject・
//   ラベル行 / グループ行 / 未読み込み行・getFillValue・rows への反映)を固定します。
import { describe, expect, it, vi } from 'vitest';

import {
  applyFillEditsToRows,
  buildFillEdits,
  previewFillValue,
  resolveFillColumnBounds,
  resolveFillDoubleClickTarget,
  resolveFillTarget,
  unionFillRange,
  type FillRange,
} from './fillHandle';
import { DETAIL_TOGGLE_COLUMN_KEY } from './detailRow';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from './rowReorder';
import type { GridColumn, GridGroupRow, GridLabelRow, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; no: unknown; name: unknown; qty: unknown };

const columns: GridColumn<Row>[] = [
  { key: 'no', width: 80 },
  { key: 'name', width: 120 },
  { key: 'qty', width: 80 },
];

const modelOf = (view: (Row | undefined)[], extra: Partial<RowModel<Row>> = {}): RowModel<Row> => ({
  getRowCount: () => view.length,
  getRow: (index) => view[index] as Row,
  getSourceIndex: (index) => (view[index] === undefined ? (undefined as unknown as number) : index),
  getRowKey: (index) => index,
  ...extra,
});

const rowsOf = (count: number, fill: (index: number) => Partial<Row> = () => ({})): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: index, no: null, name: null, qty: null, ...fill(index) }));

const range = (startRow: number, endRow: number, startCol: number, endCol: number): FillRange => ({
  startRow,
  endRow,
  startCol,
  endCol,
});

const allowAll = () => true;

describe('resolveFillTarget', () => {
  const bounds = { first: 0, last: 5 };
  const source = range(2, 3, 1, 2);

  it('下 / 上 / 右 / 左へはみ出したぶんを埋める', () => {
    expect(resolveFillTarget(source, { row: 6, col: 2 }, 10, bounds)).toEqual({
      direction: 'down',
      range: range(4, 6, 1, 2),
    });
    expect(resolveFillTarget(source, { row: 0, col: 1 }, 10, bounds)).toEqual({
      direction: 'up',
      range: range(0, 1, 1, 2),
    });
    expect(resolveFillTarget(source, { row: 3, col: 4 }, 10, bounds)).toEqual({
      direction: 'right',
      range: range(2, 3, 3, 4),
    });
    expect(resolveFillTarget(source, { row: 2, col: 0 }, 10, bounds)).toEqual({
      direction: 'left',
      range: range(2, 3, 0, 0),
    });
  });

  it('縦横のはみ出しが大きいほう、同じなら縦', () => {
    expect(resolveFillTarget(source, { row: 4, col: 5 }, 10, bounds)?.direction).toBe('right');
    expect(resolveFillTarget(source, { row: 5, col: 4 }, 10, bounds)?.direction).toBe('down');
    expect(resolveFillTarget(source, { row: 4, col: 3 }, 10, bounds)?.direction).toBe('down');
  });

  it('元の範囲の内側では埋めない', () => {
    expect(resolveFillTarget(source, { row: 3, col: 1 }, 10, bounds)).toBeNull();
    expect(resolveFillTarget(source, { row: 2, col: 2 }, 10, bounds)).toBeNull();
  });

  it('表の端と合成列の手前で止める', () => {
    expect(resolveFillTarget(source, { row: 99, col: 2 }, 10, bounds)?.range).toEqual(range(4, 9, 1, 2));
    expect(resolveFillTarget(range(0, 0, 2, 2), { row: 0, col: 0 }, 10, { first: 1, last: 5 })).toEqual({
      direction: 'left',
      range: range(0, 0, 1, 1),
    });
    expect(resolveFillTarget(range(0, 0, 1, 1), { row: 0, col: 0 }, 10, { first: 1, last: 5 })).toBeNull();
    expect(resolveFillTarget(source, { row: 0, col: 0 }, 0, bounds)).toBeNull();
  });

  it('unionFillRange は元の範囲と埋める範囲を合わせる', () => {
    const target = resolveFillTarget(source, { row: 0, col: 1 }, 10, bounds);
    expect(target && unionFillRange(source, target)).toEqual(range(0, 3, 1, 2));
  });
});

describe('resolveFillColumnBounds', () => {
  it('合成列を除いたデータ列の端', () => {
    const withSynthetic: GridColumn<Row>[] = [
      { key: ROW_DRAG_HANDLE_COLUMN_KEY, width: 28 },
      { key: DETAIL_TOGGLE_COLUMN_KEY, width: 28 },
      ...columns,
    ];
    expect(resolveFillColumnBounds(withSynthetic)).toEqual({ first: 2, last: 4 });
    expect(resolveFillColumnBounds([{ key: ROW_DRAG_HANDLE_COLUMN_KEY, width: 28 }])).toBeNull();
  });
});

describe('buildFillEdits(下 / 上)', () => {
  it('列ごとに値を決めて下へ埋める', () => {
    const rows = rowsOf(5, (index) => (index === 0 ? { no: 1, name: 'P-001', qty: 120 } : index === 1 ? { no: 2 } : {}));
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns,
      source: range(0, 1, 0, 0),
      target: { direction: 'down', range: range(2, 4, 0, 0) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.kind).toBe('series');
    expect(result.seriesAvailable).toBe(true);
    expect(result.edits.map((edit) => [edit.viewIndex, edit.column.key, edit.value])).toEqual([
      [2, 'no', 3],
      [3, 'no', 4],
      [4, 'no', 5],
    ]);
  });

  it('列ごとに既定の埋め方が違う(数値 1 つはコピー、P-001 は連続)', () => {
    const rows = rowsOf(3, (index) => (index === 0 ? { name: 'P-001', qty: 120 } : {}));
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns,
      source: range(0, 0, 1, 2),
      target: { direction: 'down', range: range(1, 2, 1, 2) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.kind).toBe('series');
    expect(result.edits.map((edit) => [edit.viewIndex, edit.column.key, edit.value])).toEqual([
      [1, 'name', 'P-002'],
      [2, 'name', 'P-003'],
      [1, 'qty', 120],
      [2, 'qty', 120],
    ]);
    // Ctrl(toggled)で入れ替わる。
    const toggled = buildFillEdits({
      rowModel: modelOf(rows),
      columns,
      source: range(0, 0, 1, 2),
      target: { direction: 'down', range: range(1, 2, 1, 2) },
      request: 'toggled',
      canWriteCell: allowAll,
    });
    expect(toggled.edits.map((edit) => edit.value)).toEqual(['P-001', 'P-001', 121, 122]);
  });

  it('上へ埋めると逆向きに続く', () => {
    const rows = rowsOf(5, (index) => (index >= 3 ? { no: index - 2 } : {}));
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns,
      source: range(3, 4, 0, 0),
      target: { direction: 'up', range: range(0, 2, 0, 0) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.edits.map((edit) => [edit.viewIndex, edit.value])).toEqual([
      [2, 0],
      [1, -1],
      [0, -2],
    ]);
  });

  it('元の値が 1 つなら、上 / 左へは 1 ずつ戻る(ツールチップの値も同じ)', () => {
    const rows = rowsOf(3, (index) => (index === 2 ? { name: 'P-005', no: 5 } : {}));
    const up = {
      rowModel: modelOf(rows),
      columns,
      source: range(2, 2, 0, 1),
      target: { direction: 'up' as const, range: range(0, 1, 0, 1) },
    };
    // 既定: 数値 1 つはコピー、末尾の数は 1 ずつ戻る。Ctrl(toggled)ではその逆。
    const auto = buildFillEdits({ ...up, request: 'auto', canWriteCell: allowAll });
    expect(auto.edits.map((edit) => [edit.viewIndex, edit.column.key, edit.value])).toEqual([
      [1, 'no', 5],
      [0, 'no', 5],
      [1, 'name', 'P-004'],
      [0, 'name', 'P-003'],
    ]);
    const toggled = buildFillEdits({ ...up, request: 'toggled', canWriteCell: allowAll });
    expect(toggled.edits.map((edit) => [edit.viewIndex, edit.column.key, edit.value])).toEqual([
      [1, 'no', 4],
      [0, 'no', 3],
      [1, 'name', 'P-005'],
      [0, 'name', 'P-005'],
    ]);
    expect(previewFillValue({ ...up, request: 'toggled' })?.value).toBe(3);
    const left = buildFillEdits({
      rowModel: modelOf(rowsOf(1, () => ({ qty: 'P-010' }))),
      columns,
      source: range(0, 0, 2, 2),
      target: { direction: 'left', range: range(0, 0, 1, 1) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(left.edits.map((edit) => [edit.column.key, edit.value])).toEqual([['name', 'P-009']]);
  });

  it('編集できないセルと reject の検証 NG は飛ばす(位置は数える)', () => {
    const rejectColumns: GridColumn<Row>[] = [
      { key: 'no', width: 80, validationMode: 'reject', validate: ({ value }) => Number(value) <= 3 || '3 以下' },
      ...columns.slice(1),
    ];
    const rows = rowsOf(5, (index) => (index === 0 ? { no: 1 } : index === 1 ? { no: 2 } : {}));
    const canWriteCell = vi.fn((viewIndex: number) => viewIndex !== 2);
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns: rejectColumns,
      source: range(0, 1, 0, 0),
      target: { direction: 'down', range: range(2, 4, 0, 0) },
      request: 'auto',
      canWriteCell,
    });
    // 2 行目は編集不可、4 行目(値 5)は reject。3 行目(値 4)も reject。
    expect(result.edits).toEqual([]);
    expect(canWriteCell).toHaveBeenCalledWith(3, 0, rows[3], rejectColumns[0]);
    const lenient = buildFillEdits({
      rowModel: modelOf(rows),
      columns: rejectColumns,
      source: range(0, 0, 0, 0),
      target: { direction: 'down', range: range(1, 4, 0, 0) },
      request: 'copy',
      canWriteCell,
    });
    expect(lenient.edits.map((edit) => edit.viewIndex)).toEqual([1, 3, 4]);
  });

  it('合成列は元の値にも埋める先にも使わない', () => {
    const withHandle: GridColumn<Row>[] = [{ key: ROW_DRAG_HANDLE_COLUMN_KEY, width: 28 }, ...columns];
    const rows = rowsOf(2, (index) => (index === 0 ? { no: 7 } : {}));
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns: withHandle,
      source: range(0, 0, 0, 1),
      target: { direction: 'down', range: range(1, 1, 0, 1) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.edits.map((edit) => [edit.column.key, edit.value])).toEqual([['no', 7]]);
  });

  it('ラベル行 / グループ行は飛ばして数えない', () => {
    const rows = rowsOf(5, (index) => (index === 0 ? { no: 1 } : index === 1 ? { no: 2 } : {}));
    const view: (Row | undefined)[] = [rows[0], rows[1], undefined, rows[3], rows[4]];
    const label = { kind: 'label' } as unknown as GridLabelRow<Row>;
    const result = buildFillEdits({
      rowModel: modelOf(view, { getLabelRow: (index) => (index === 2 ? label : undefined) }),
      columns,
      source: range(0, 1, 0, 0),
      target: { direction: 'down', range: range(2, 4, 0, 0) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.edits.map((edit) => [edit.viewIndex, edit.value])).toEqual([
      [3, 3],
      [4, 4],
    ]);
    const group = { kind: 'group' } as unknown as GridGroupRow;
    const grouped = buildFillEdits({
      rowModel: modelOf([undefined, rows[0], rows[1], undefined, rows[3]], {
        getGroupRow: (index) => (index === 0 || index === 3 ? group : undefined),
      }),
      columns,
      source: range(0, 2, 0, 0),
      target: { direction: 'down', range: range(3, 4, 0, 0) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(grouped.edits.map((edit) => [edit.viewIndex, edit.value])).toEqual([[4, 3]]);
  });

  it('未読み込み行(SSRM)は位置に数えるが書かず、元の値にあればその列は埋めない', () => {
    const rows = rowsOf(5, (index) => (index === 0 ? { no: 1 } : index === 1 ? { no: 2 } : {}));
    const result = buildFillEdits({
      rowModel: modelOf([rows[0], rows[1], undefined, rows[3], rows[4]]),
      columns,
      source: range(0, 1, 0, 0),
      target: { direction: 'down', range: range(2, 4, 0, 0) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.edits.map((edit) => [edit.viewIndex, edit.value])).toEqual([
      [3, 4],
      [4, 5],
    ]);
    const missingSource = buildFillEdits({
      rowModel: modelOf([rows[0], undefined, rows[2]]),
      columns,
      source: range(0, 1, 0, 0),
      target: { direction: 'down', range: range(2, 2, 0, 0) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(missingSource.edits).toEqual([]);
  });

  it('getFillValue の返り値を書く', () => {
    const rows = rowsOf(3, (index) => (index === 0 ? { no: 10 } : {}));
    const getFillValue = vi.fn(({ defaultValue, index }: { defaultValue: unknown; index: number }) =>
      index === 1 ? 'x' : defaultValue,
    );
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns,
      source: range(0, 0, 0, 0),
      target: { direction: 'down', range: range(1, 2, 0, 0) },
      request: 'toggled',
      canWriteCell: allowAll,
      getFillValue,
    });
    expect(result.edits.map((edit) => edit.value)).toEqual([11, 'x']);
    expect(getFillValue).toHaveBeenNthCalledWith(1, {
      column: columns[0],
      row: rows[1],
      rowIndex: 1,
      sourceValues: [10],
      index: 0,
      direction: 'down',
      kind: 'series',
      defaultValue: 11,
    });
  });

  it('続き方の無い値だけならコピーで、連続データは選べない', () => {
    const rows = rowsOf(3, (index) => (index === 0 ? { name: '東京' } : {}));
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns,
      source: range(0, 0, 1, 1),
      target: { direction: 'down', range: range(1, 2, 1, 1) },
      request: 'series',
      canWriteCell: allowAll,
    });
    expect(result).toMatchObject({ kind: 'copy', seriesAvailable: false });
    expect(result.edits.map((edit) => edit.value)).toEqual(['東京', '東京']);
  });
});

describe('buildFillEdits(右 / 左)', () => {
  it('行ごとに値を決めて右へ埋める', () => {
    const wide: GridColumn<Row>[] = [
      { key: 'no', width: 80 },
      { key: 'name', width: 80 },
      { key: 'qty', width: 80 },
    ];
    const rows = rowsOf(2, (index) => (index === 0 ? { no: '月' } : { no: 5 }));
    const result = buildFillEdits({
      rowModel: modelOf(rows),
      columns: wide,
      source: range(0, 1, 0, 0),
      target: { direction: 'right', range: range(0, 1, 1, 2) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.edits.map((edit) => [edit.viewIndex, edit.column.key, edit.value])).toEqual([
      [0, 'name', '火'],
      [0, 'qty', '水'],
      [1, 'name', 5],
      [1, 'qty', 5],
    ]);
  });

  it('左へ埋めると逆向き、合成列は飛ばす、ラベル行は埋めない', () => {
    const withHandle: GridColumn<Row>[] = [
      { key: 'no', width: 80 },
      { key: DETAIL_TOGGLE_COLUMN_KEY, width: 28 },
      { key: 'name', width: 80 },
      { key: 'qty', width: 80 },
    ];
    const rows = rowsOf(2, () => ({ name: 2, qty: 3 }));
    const label = { kind: 'label' } as unknown as GridLabelRow<Row>;
    const result = buildFillEdits({
      rowModel: modelOf([rows[0], undefined], { getLabelRow: (index) => (index === 1 ? label : undefined) }),
      columns: withHandle,
      source: range(0, 1, 2, 3),
      target: { direction: 'left', range: range(0, 1, 0, 1) },
      request: 'auto',
      canWriteCell: allowAll,
    });
    expect(result.edits.map((edit) => [edit.viewIndex, edit.column.key, edit.value])).toEqual([[0, 'no', 1]]);
  });
});

describe('resolveFillDoubleClickTarget', () => {
  it('左隣の列に値が続くところまで下へ', () => {
    const rows = rowsOf(6, (index) => ({ no: index < 4 ? index + 1 : null, name: index === 0 ? 'A1' : null }));
    expect(resolveFillDoubleClickTarget(range(0, 0, 1, 1), modelOf(rows), columns)).toEqual({
      direction: 'down',
      range: range(1, 3, 1, 1),
    });
  });

  it('左隣が空なら右隣、どちらも空なら埋めない', () => {
    const rows = rowsOf(5, (index) => ({ name: index === 0 ? 'A1' : null, qty: index < 3 ? 1 : null }));
    expect(resolveFillDoubleClickTarget(range(0, 0, 1, 1), modelOf(rows), columns)?.range).toEqual(
      range(1, 2, 1, 1),
    );
    const empty = rowsOf(5, (index) => ({ name: index === 0 ? 'A1' : null }));
    expect(resolveFillDoubleClickTarget(range(0, 0, 1, 1), modelOf(empty), columns)).toBeNull();
  });

  it('埋める列に値がある行の手前で止める(上書きしない)', () => {
    const rows = rowsOf(6, (index) => ({ no: 1, name: index === 0 ? 'A1' : index === 3 ? 'keep' : null }));
    expect(resolveFillDoubleClickTarget(range(0, 0, 1, 1), modelOf(rows), columns)?.range).toEqual(
      range(1, 2, 1, 1),
    );
  });

  it('ラベル行 / 表の端 / 合成列の隣', () => {
    const rows = rowsOf(4, () => ({ no: 1, name: null }));
    rows[0].name = 'A1';
    const label = { kind: 'label' } as unknown as GridLabelRow<Row>;
    expect(
      resolveFillDoubleClickTarget(
        range(0, 0, 1, 1),
        modelOf([rows[0], rows[1], undefined, rows[3]], { getLabelRow: (index) => (index === 2 ? label : undefined) }),
        columns,
      )?.range,
    ).toEqual(range(1, 1, 1, 1));
    expect(resolveFillDoubleClickTarget(range(3, 3, 1, 1), modelOf(rows), columns)).toBeNull();
    // 左隣が合成列ならさらに左のデータ列を見る。
    const withHandle: GridColumn<Row>[] = [columns[0], { key: ROW_DRAG_HANDLE_COLUMN_KEY, width: 28 }, columns[1]];
    expect(resolveFillDoubleClickTarget(range(0, 0, 2, 2), modelOf(rows), withHandle)?.range).toEqual(
      range(1, 3, 2, 2),
    );
  });
});

describe('applyFillEditsToRows', () => {
  it('ビュー行を元の行へ換算して書き、書き込みが無ければ同じ配列', () => {
    const rows = rowsOf(3);
    const order = [2, 0, 1];
    const model = { getSourceIndex: (viewIndex: number) => order[viewIndex] };
    const next = applyFillEditsToRows(rows, model, [
      { viewIndex: 0, column: columns[0], value: 9 },
      { viewIndex: 0, column: columns[1], value: 'x' },
    ]);
    expect(next).not.toBe(rows);
    expect(next[2]).toEqual({ id: 2, no: 9, name: 'x', qty: null });
    expect(next[0]).toBe(rows[0]);
    expect(applyFillEditsToRows(rows, model, [])).toBe(rows);
  });
});