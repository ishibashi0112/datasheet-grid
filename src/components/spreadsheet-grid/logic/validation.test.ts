// logic/validation(セル編集バリデーション純ロジック)の単体テストです。
//   ペースト(applyClipboardMatrixToRows)/ クリア(clearCellsInSelection)の reject skip も
//   ここで純関数レベルで検証します(経路 B / C の配線確認)。
import { describe, expect, it } from 'vitest';
import type { GridColumn } from '../model/gridTypes';
import {
  DEFAULT_INVALID_MESSAGE,
  decideCellWrite,
  getInvalidMessage,
  normalizeValidationResult,
  scanInvalidCells,
} from './validation';
import { applyClipboardMatrixToRows } from '../utils/clipboard';
import { clearCellsInSelection } from './clearCells';

type Row = { id: number; qty: unknown };

const makeRow = (over: Partial<Row> = {}): Row => ({ id: 1, qty: 10, ...over });

// qty 列: 有限数値のみ有効。
const qtyValidate = (ctx: { value: unknown }) =>
  typeof ctx.value === 'number' && Number.isFinite(ctx.value)
    ? true
    : '数値を入力してください';

const markColumn: GridColumn<Row> = {
  key: 'qty',
  width: 80,
  validate: qtyValidate,
};

const rejectColumn: GridColumn<Row> = {
  key: 'qty',
  width: 80,
  validate: qtyValidate,
  validationMode: 'reject',
};

describe('normalizeValidationResult', () => {
  it('true は有効、false は既定メッセージ付き無効', () => {
    expect(normalizeValidationResult(true)).toEqual({
      valid: true,
      message: '',
    });
    expect(normalizeValidationResult(false)).toEqual({
      valid: false,
      message: DEFAULT_INVALID_MESSAGE,
    });
  });

  it('string / { message } は無効 + メッセージ(空文字は既定へ倒す)', () => {
    expect(normalizeValidationResult('NG です')).toEqual({
      valid: false,
      message: 'NG です',
    });
    expect(normalizeValidationResult({ message: '範囲外' })).toEqual({
      valid: false,
      message: '範囲外',
    });
    expect(normalizeValidationResult('')).toEqual({
      valid: false,
      message: DEFAULT_INVALID_MESSAGE,
    });
  });
});

describe('getInvalidMessage', () => {
  it('validate 未指定 / 検証 OK は null、NG はメッセージ', () => {
    expect(getInvalidMessage({ key: 'id', width: 80 }, makeRow(), 'x')).toBeNull();
    expect(getInvalidMessage(markColumn, makeRow(), 10)).toBeNull();
    expect(getInvalidMessage(markColumn, makeRow(), 'abc')).toBe(
      '数値を入力してください',
    );
  });
});

describe('decideCellWrite', () => {
  it("既定('mark')は検証 NG でも write(警告は表示側)", () => {
    expect(decideCellWrite(markColumn, makeRow(), 'abc')).toEqual({
      action: 'write',
    });
  });

  it("'reject' は検証 NG で reject、OK は write", () => {
    expect(decideCellWrite(rejectColumn, makeRow(), 'abc')).toEqual({
      action: 'reject',
      message: '数値を入力してください',
    });
    expect(decideCellWrite(rejectColumn, makeRow(), 42)).toEqual({
      action: 'write',
    });
  });
});

describe('scanInvalidCells', () => {
  it('validate 指定列 × 全ソース行を走査し、invalid セルを source 基準で返す', () => {
    const rows = [makeRow({ id: 1, qty: 10 }), makeRow({ id: 2, qty: 'abc' })];
    const columns: GridColumn<Row>[] = [{ key: 'id', width: 80 }, markColumn];
    const invalidCells = scanInvalidCells(rows, columns, (row) => row.id);
    expect(invalidCells).toEqual([
      {
        rowKey: 2,
        sourceRowIndex: 1,
        columnKey: 'qty',
        message: '数値を入力してください',
      },
    ]);
  });

  it('validate 指定列がなければ空配列、rowKey 未解決は sourceRowIndex へフォールバック', () => {
    expect(
      scanInvalidCells([makeRow()], [{ key: 'id', width: 80 }], () => undefined),
    ).toEqual([]);
    const invalidCells = scanInvalidCells(
      [makeRow({ qty: 'abc' })],
      [markColumn],
      () => undefined,
    );
    expect(invalidCells[0].rowKey).toBe(0);
  });
});

describe('経路 B: ペースト(applyClipboardMatrixToRows)の reject skip', () => {
  it('reject 列は不正セルのみスキップし、有効セルは書き込む', () => {
    // number エディタの既定パーサ('42'→42 / 'abc'→'abc' のまま)+ reject 検証の組合せ。
    const rejectNumberColumn: GridColumn<Row> = {
      ...rejectColumn,
      editor: { type: 'number' },
    };
    const rows = [makeRow({ id: 1, qty: 10 }), makeRow({ id: 2, qty: 20 })];
    // qty へ 1 列 × 2 行のペースト: 1 行目は不正('abc')、2 行目は有効('42')。
    const nextRows = applyClipboardMatrixToRows(
      rows,
      (viewIndex) => viewIndex,
      [rejectNumberColumn],
      [['abc'], ['42']],
      0,
      0,
      () => true,
    );
    expect(nextRows[0]).toBe(rows[0]);
    expect(nextRows[1].qty).toBe(42);
  });

  it('mark 列は不正値もそのまま書き込む(表示側で警告)', () => {
    const rows = [makeRow({ qty: 10 })];
    const nextRows = applyClipboardMatrixToRows(
      rows,
      (viewIndex) => viewIndex,
      [markColumn],
      [['abc']],
      0,
      0,
      () => true,
    );
    expect(nextRows[0].qty).toBe('abc');
  });
});

describe('経路 C: クリア(clearCellsInSelection)の reject skip', () => {
  it("reject 列はクリア値が検証 NG ならスキップする(『必須列は Delete で空にできない』)", () => {
    // クリア値は parseClipboardValue 未指定のため ''(qtyValidate で NG)。
    const rows = [makeRow({ qty: 10 })];
    const result = clearCellsInSelection({
      rows,
      resolveSourceIndex: (viewIndex) => viewIndex,
      columns: [rejectColumn],
      selection: null,
      activeCell: { row: 0, col: 0 },
      viewRowCount: 1,
      canWriteCell: () => true,
    });
    expect(result.changed).toBe(false);
    expect(result.nextRows).toBe(rows);
  });

  it('mark 列はクリア値が検証 NG でも書き込む', () => {
    const rows = [makeRow({ qty: 10 })];
    const result = clearCellsInSelection({
      rows,
      resolveSourceIndex: (viewIndex) => viewIndex,
      columns: [markColumn],
      selection: null,
      activeCell: { row: 0, col: 0 },
      viewRowCount: 1,
      canWriteCell: () => true,
    });
    expect(result.changed).toBe(true);
    expect(result.nextRows[0].qty).toBe('');
  });
});