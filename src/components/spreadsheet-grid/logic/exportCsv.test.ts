import { describe, it, expect } from 'vitest';

import { serializeRowsToCsv } from './exportCsv';
import type { GridColumn } from '../model/gridTypes';

type Row = { a: string; b: number; c?: string };

const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'A', width: 100 },
  { key: 'b', title: 'B', width: 100 },
];

const rows: Row[] = [
  { a: 'x', b: 1 },
  { a: 'y', b: 2 },
  { a: 'z', b: 3 },
];

const getRow = (i: number): Row => rows[i];

describe('serializeRowsToCsv', () => {
  it('ヘッダー + 行を CRLF 区切りで出力する', () => {
    const csv = serializeRowsToCsv({
      getRow,
      startRow: 0,
      endRow: rows.length,
      columns,
    });
    expect(csv).toBe('A,B\r\nx,1\r\ny,2\r\nz,3');
  });

  it('includeHeaders=false でヘッダーを省く', () => {
    const csv = serializeRowsToCsv({
      getRow,
      startRow: 0,
      endRow: 2,
      columns,
      includeHeaders: false,
    });
    expect(csv).toBe('x,1\r\ny,2');
  });

  it('レンジ [startRow, endRow) は end 排他', () => {
    const csv = serializeRowsToCsv({
      getRow,
      startRow: 1,
      endRow: 2,
      columns,
      includeHeaders: false,
    });
    expect(csv).toBe('y,2');
  });

  it('区切り文字 / ダブルクォート / 改行を含む値をクォートする', () => {
    const esc: Row[] = [
      { a: 'a,b', b: 0 },
      { a: 'he said "hi"', b: 0 },
      { a: 'line1\nline2', b: 0 },
    ];
    const cols: GridColumn<Row>[] = [{ key: 'a', title: 'A', width: 100 }];
    const csv = serializeRowsToCsv({
      getRow: (i: number): Row => esc[i],
      startRow: 0,
      endRow: esc.length,
      columns: cols,
      includeHeaders: false,
    });
    expect(csv).toBe('"a,b"\r\n"he said ""hi"""\r\n"line1\nline2"');
  });

  it('delimiter を変更できる(TSV 風)', () => {
    const csv = serializeRowsToCsv({
      getRow,
      startRow: 0,
      endRow: 2,
      columns,
      includeHeaders: false,
      delimiter: '\t',
    });
    expect(csv).toBe('x\t1\r\ny\t2');
  });

  it('bom=true で先頭に UTF-8 BOM を付ける', () => {
    const csv = serializeRowsToCsv({
      getRow,
      startRow: 0,
      endRow: 1,
      columns,
      includeHeaders: false,
      bom: true,
    });
    expect(csv).toBe('\uFEFFx,1');
  });

  it('未ロード行(undefined)をスキップする(SSRM)', () => {
    const sparse: (Row | undefined)[] = [
      { a: 'x', b: 1 },
      undefined,
      { a: 'z', b: 3 },
    ];
    const csv = serializeRowsToCsv({
      getRow: (i: number): Row => sparse[i] as Row,
      startRow: 0,
      endRow: 3,
      columns,
      includeHeaders: false,
    });
    expect(csv).toBe('x,1\r\nz,3');
  });
});