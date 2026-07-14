// logic/editorValues(パーサ解決 / commit 値規則 / 行書き込み)の単体テストです。
import { describe, expect, it } from 'vitest';
import type { GridColumn } from '../model/gridTypes';
import {
  parseCommittedValue,
  resolveCellParser,
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