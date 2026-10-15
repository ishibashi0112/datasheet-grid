// logic/editorValues(パーサ解決 / commit 値規則 / 行書き込み)の単体テストです。
import { describe, expect, it } from 'vitest';
import type { GridColumn } from '../model/gridTypes.unbound';
import {
  parseCommittedValue,
  resolveCellParser,
  toDateInputValue,
  toNumberInputText,
  writeRowsCell,
} from './editorValues';

type Row = { id: number; name: string; qty: number | string | null };

const makeRow = (over: Partial<Row> = {}): Row => ({
  id: 1,
  name: 'a',
  qty: 10,
  ...over,
});

const nameColumn: GridColumn<Row> = { key: 'name', width: 100 };

// qty 列: parseClipboardValue 明示指定('' → null / 数値文字列 → number)。
const qtyColumn: GridColumn<Row> = {
  key: 'qty',
  width: 80,
  parseClipboardValue: (raw) => (raw === '' ? null : Number(raw)),
};

describe('resolveCellParser', () => {
  it('parseClipboardValue 未指定なら identity(生文字列のまま)', () => {
    const parser = resolveCellParser(nameColumn);
    expect(parser('abc', makeRow())).toBe('abc');
    expect(parser('', makeRow())).toBe('');
  });

  it('parseClipboardValue 明示指定が常に勝つ', () => {
    const parser = resolveCellParser(qtyColumn);
    expect(parser('12', makeRow())).toBe(12);
    expect(parser('', makeRow())).toBeNull();
  });

  it('editor:number の既定パーサ: 空→null / 数値→number / 非数値→生文字列のまま', () => {
    const column: GridColumn<Row> = {
      key: 'qty',
      width: 80,
      editor: { type: 'number' },
    };
    const parser = resolveCellParser(column);
    expect(parser('', makeRow())).toBeNull();
    expect(parser('12.5', makeRow())).toBe(12.5);
    expect(parser('-3', makeRow())).toBe(-3);
    expect(parser('abc', makeRow())).toBe('abc');
    // 非有限(Infinity / NaN)は数値化せず生文字列のまま。
    expect(parser('Infinity', makeRow())).toBe('Infinity');
  });

  it('editor:number の既定パーサ: 全角の数字・符号・小数点と 3 桁区切りも数値として読む(全角数値)', () => {
    const column: GridColumn<Row> = {
      key: 'qty',
      width: 80,
      editor: { type: 'number' },
    };
    const parser = resolveCellParser(column);
    expect(parser('１２３', makeRow())).toBe(123);
    expect(parser('１２．５', makeRow())).toBe(12.5);
    // IME のひらがな入力の「ー」(長音)/ 全角マイナス / マイナス記号。
    expect(parser('ー５', makeRow())).toBe(-5);
    expect(parser('－５', makeRow())).toBe(-5);
    expect(parser('−５', makeRow())).toBe(-5);
    // 3 桁区切り(Excel の書式付きの値の貼り付け)。区切り方が 3 桁でないものは数値にしない。
    expect(parser('1,234', makeRow())).toBe(1234);
    expect(parser('１，２３４，５６７．８', makeRow())).toBe(1234567.8);
    expect(parser('-1,234', makeRow())).toBe(-1234);
    expect(parser('12,34', makeRow())).toBe('12,34');
    expect(parser('0,500', makeRow())).toBe('0,500');
    // 句読点の設定が「、。」の IME で「.」「,」キーから入る「。」「、」。
    expect(parser('１２。５', makeRow())).toBe(12.5);
    expect(parser('１、２３４', makeRow())).toBe(1234);
    // 前後の空白(全角含む)は無視、空白だけは null(従来は 0)。
    expect(parser('　１２　', makeRow())).toBe(12);
    expect(parser('   ', makeRow())).toBeNull();
    expect(parser('　', makeRow())).toBeNull();
    // 数値でないものは元の文字列のまま(寄せた文字列ではない)。
    expect(parser('１２あ', makeRow())).toBe('１２あ');
    expect(parser('ー', makeRow())).toBe('ー');
    // 丸数字 / 上付き数字は別の数に化けないよう数値にしない(NFKC は使わない)。
    expect(parser('①', makeRow())).toBe('①');
    expect(parser('10⁵', makeRow())).toBe('10⁵');
  });

  it('toNumberInputText: type="number" に入れられる半角の文字列、読めなければ null(全角数値)', () => {
    expect(toNumberInputText('１２．５')).toBe('12.5');
    expect(toNumberInputText('ー１２')).toBe('-12');
    expect(toNumberInputText('１，２３４')).toBe('1234');
    expect(toNumberInputText('１。５')).toBe('1.5');
    expect(toNumberInputText('1e3')).toBe('1e3');
    // type="number" が受け付けない書き方は数値を文字列に戻す。
    expect(toNumberInputText('１．')).toBe('1');
    expect(toNumberInputText('．５')).toBe('0.5');
    expect(toNumberInputText('＋５')).toBe('5');
    expect(toNumberInputText('かな')).toBeNull();
    expect(toNumberInputText('')).toBeNull();
    expect(toNumberInputText('Infinity')).toBeNull();
  });

  it('editor:number でも parseClipboardValue 明示指定が勝つ', () => {
    const column: GridColumn<Row> = {
      key: 'qty',
      width: 80,
      editor: { type: 'number' },
      parseClipboardValue: (raw) => `custom:${raw}`,
    };
    expect(resolveCellParser(column)('12', makeRow())).toBe('custom:12');
  });

  it('editor:date の既定パーサ: 空→null / 解釈可→正規化 / 解釈不可→生文字列のまま', () => {
    const column: GridColumn<Row> = {
      key: 'name',
      width: 120,
      editor: { type: 'date' },
    };
    const parser = resolveCellParser(column);
    expect(parser('', makeRow())).toBeNull();
    expect(parser('2026-07-14', makeRow())).toBe('2026-07-14');
    expect(parser('2026/07/14', makeRow())).toBe('2026-07-14');
    expect(parser('日付でない', makeRow())).toBe('日付でない');
  });
});

describe('toDateInputValue', () => {
  it('Date インスタンスをローカル日付の YYYY-MM-DD へ整形する', () => {
    expect(toDateInputValue(new Date(2026, 6, 14))).toBe('2026-07-14');
    expect(toDateInputValue(new Date(999, 0, 2))).toBe('0999-01-02');
  });

  it('YYYY-MM-DD 先頭の文字列(ISO 日時含む)は先頭 10 文字を採用する', () => {
    expect(toDateInputValue('2026-07-14')).toBe('2026-07-14');
    expect(toDateInputValue('2026-07-14T12:34:56Z')).toBe('2026-07-14');
  });

  it('Date.parse 可能な文字列は正規化し、解釈できない値は空文字を返す', () => {
    expect(toDateInputValue('2026/07/14')).toBe('2026-07-14');
    expect(toDateInputValue('not-a-date')).toBe('');
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(12345)).toBe('');
    expect(toDateInputValue(new Date('invalid'))).toBe('');
  });
});

describe('parseCommittedValue', () => {
  it('string の commit 値は列パーサを通す', () => {
    expect(parseCommittedValue(qtyColumn, '42', makeRow())).toBe(42);
    expect(parseCommittedValue(nameColumn, 'text', makeRow())).toBe('text');
  });

  it('string 以外の commit 値はパーサ非経由でそのまま返す', () => {
    expect(parseCommittedValue(qtyColumn, 42, makeRow())).toBe(42);
    expect(parseCommittedValue(qtyColumn, null, makeRow())).toBeNull();
    const domainValue = { nested: true };
    expect(parseCommittedValue(nameColumn, domainValue, makeRow())).toBe(
      domainValue,
    );
  });
});

describe('writeRowsCell', () => {
  it('該当 source 行だけ差し替え、他行は参照を維持する', () => {
    const rows = [makeRow({ id: 1 }), makeRow({ id: 2 }), makeRow({ id: 3 })];
    const nextRows = writeRowsCell(rows, 1, nameColumn, 'renamed');

    expect(nextRows).not.toBe(rows);
    expect(nextRows[0]).toBe(rows[0]);
    expect(nextRows[2]).toBe(rows[2]);
    expect(nextRows[1]).not.toBe(rows[1]);
    expect(nextRows[1].name).toBe('renamed');
    expect(rows[1].name).toBe('a');
  });

  it('column.setValue 明示指定はそれを使って書き込む', () => {
    const column: GridColumn<Row> = {
      key: 'qty',
      width: 80,
      setValue: (row, value) => ({ ...row, qty: Number(value) * 2 }),
    };
    const rows = [makeRow()];
    const nextRows = writeRowsCell(rows, 0, column, 5);
    expect(nextRows[0].qty).toBe(10);
  });
});