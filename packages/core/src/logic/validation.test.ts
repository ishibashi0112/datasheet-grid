// logic/validation(セル編集バリデーション純ロジック)の単体テストです。
//   ペースト(applyClipboardMatrixToRows)/ クリア(clearCellsInSelection)の reject skip も
//   ここで純関数レベルで検証します(経路 B / C の配線確認)。
import { describe, expect, it } from 'vitest';
import type { GridColumn } from '../model/gridTypes.unbound';
import {
  DEFAULT_INVALID_MESSAGE,
  decideCellWrite,
  getInvalidMessage,
  hasCellValidation,
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

// 追加(数値の検査): number エディタの min / max / integer による組み込みの検査。
describe('数値の検査(number エディタの min / max / integer)', () => {
  const numberColumn = (editor: { min?: number; max?: number; step?: number; integer?: boolean }): GridColumn<Row> => ({
    key: 'qty',
    width: 80,
    editor: { type: 'number', ...editor },
  });
  const message = (column: GridColumn<Row>, value: unknown) => getInvalidMessage(column, makeRow({ qty: value }), value);

  it('min / max / integer のどれかがある number 列だけが検査の対象(step だけ・他の種別は対象外)', () => {
    expect(hasCellValidation(numberColumn({ min: 0 }))).toBe(true);
    expect(hasCellValidation(numberColumn({ max: 10 }))).toBe(true);
    expect(hasCellValidation(numberColumn({ integer: true }))).toBe(true);
    expect(hasCellValidation(numberColumn({}))).toBe(false);
    expect(hasCellValidation(numberColumn({ step: 1, integer: false }))).toBe(false);
    expect(hasCellValidation({ key: 'qty', width: 80 })).toBe(false);
    expect(hasCellValidation(markColumn)).toBe(true);
    expect(message(numberColumn({ step: 1 }), -5)).toBeNull();
  });

  it('範囲の外はメッセージ、境界と範囲内は通す', () => {
    const minOnly = numberColumn({ min: 0 });
    expect(message(minOnly, -1)).toBe('0 以上で入力してください');
    expect(message(minOnly, -0.5)).toBe('0 以上で入力してください');
    expect(message(minOnly, 0)).toBeNull();
    expect(message(minOnly, 12.5)).toBeNull();
    const maxOnly = numberColumn({ max: 100 });
    expect(message(maxOnly, 101)).toBe('100 以下で入力してください');
    expect(message(maxOnly, 100)).toBeNull();
    const both = numberColumn({ min: 1, max: 5 });
    expect(message(both, 0)).toBe('1〜5 で入力してください');
    expect(message(both, 6)).toBe('1〜5 で入力してください');
    expect(message(both, 3)).toBeNull();
  });

  it('integer は小数を NG にする(1.0 や数値の文字列の整数は通す)', () => {
    const column = numberColumn({ integer: true });
    expect(message(column, 1.5)).toBe('整数で入力してください');
    expect(message(column, -2)).toBeNull();
    expect(message(column, 1.0)).toBeNull();
    expect(message(column, '12')).toBeNull();
    expect(message(column, '1.5')).toBe('整数で入力してください');
  });

  it('空は通し、数値として読めない値は「数値で入力してください」', () => {
    const column = numberColumn({ min: 0, integer: true });
    for (const empty of [null, undefined, '', '  ']) {
      expect(message(column, empty)).toBeNull();
    }
    expect(message(column, 'abc')).toBe('数値で入力してください');
    expect(message(column, true)).toBe('数値で入力してください');
    expect(message(column, Number.NaN)).toBe('数値で入力してください');
    expect(message(column, Infinity)).toBe('数値で入力してください');
  });

  it('検査の順番は 数値か → 整数か → 範囲', () => {
    const column = numberColumn({ min: 0, integer: true });
    expect(message(column, -1.5)).toBe('整数で入力してください');
    expect(message(column, -1)).toBe('0 以上で入力してください');
  });

  it('validate が先で、validate の NG はそのメッセージ(組み込みの日本語で上書きしない)。通した値だけ組み込みの検査', () => {
    const seen: unknown[] = [];
    const column: GridColumn<Row> = {
      ...numberColumn({ min: 0 }),
      validate: ({ value }) => {
        seen.push(value);
        return value === null || (typeof value === 'number' && value >= -10) || 'Enter a number ≥ -10';
      },
    };
    expect(message(column, -20)).toBe('Enter a number ≥ -10');
    // validate が通した値でも、min を外れていれば組み込みの検査で NG。
    expect(message(column, -1)).toBe('0 以上で入力してください');
    expect(message(column, 8)).toBeNull();
    expect(seen).toEqual([-20, -1, 8]);
  });

  it('文字列は列の既定パーサと同じく読む(3 桁区切り・全角も数値)', () => {
    const column = numberColumn({ min: 0, integer: true });
    expect(message(column, '1,234')).toBeNull();
    expect(message(column, '１２')).toBeNull();
    expect(message(column, '－５')).toBe('0 以上で入力してください');
    expect(message(column, '１．５')).toBe('整数で入力してください');
  });

  it('min / max の null は未指定と同じ扱い(JSON から作った設定など)', () => {
    const column = numberColumn({ min: null as unknown as number, max: 10 });
    expect(hasCellValidation(column)).toBe(true);
    expect(message(column, 11)).toBe('10 以下で入力してください');
    expect(message(column, -100)).toBeNull();
    expect(hasCellValidation(numberColumn({ min: null as unknown as number }))).toBe(false);
  });

  it("'reject' の列は組み込みの検査の NG でも書き込まない(貼り付けはそのセルだけ飛ばす)", () => {
    const column: GridColumn<Row> = { ...numberColumn({ min: 0, integer: true }), validationMode: 'reject' };
    expect(decideCellWrite(column, makeRow(), -1)).toEqual({ action: 'reject', message: '0 以上で入力してください' });
    expect(decideCellWrite(column, makeRow(), 3)).toEqual({ action: 'write' });
    expect(decideCellWrite({ ...column, validationMode: 'mark' }, makeRow(), -1)).toEqual({ action: 'write' });
    const rows = [makeRow({ id: 1, qty: 10 }), makeRow({ id: 2, qty: 20 }), makeRow({ id: 3, qty: 30 })];
    const nextRows = applyClipboardMatrixToRows(
      rows,
      (viewIndex) => viewIndex,
      [column],
      [['-3'], ['2.5'], ['４']],
      0,
      0,
      () => true,
    );
    expect(nextRows[0]).toBe(rows[0]);
    expect(nextRows[1]).toBe(rows[1]);
    expect(nextRows[2].qty).toBe(4);
  });

  it('getInvalidCells の走査は validate の無い number 列も対象', () => {
    const rows = [makeRow({ id: 1, qty: 3 }), makeRow({ id: 2, qty: -1 }), makeRow({ id: 3, qty: 2.5 })];
    expect(scanInvalidCells(rows, [numberColumn({ min: 0, integer: true })], (row) => row.id)).toEqual([
      { rowKey: 2, sourceRowIndex: 1, columnKey: 'qty', message: '0 以上で入力してください' },
      { rowKey: 3, sourceRowIndex: 2, columnKey: 'qty', message: '整数で入力してください' },
    ]);
  });
});