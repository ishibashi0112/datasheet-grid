import { describe, it, expect } from 'vitest';

import { buildGridExportData } from './exportData';
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

describe('buildGridExportData', () => {
  it('列メタ(key/title)と 2 次元セル(value/text)を返す', () => {
    const data = buildGridExportData({
      getRow,
      startRow: 0,
      endRow: rows.length,
      columns,
    });
    expect(data.columns).toEqual([
      { key: 'a', title: 'A' },
      { key: 'b', title: 'B' },
    ]);
    expect(data.rows).toEqual([
      [
        { value: 'x', text: 'x' },
        { value: 1, text: '1' },
      ],
      [
        { value: 'y', text: 'y' },
        { value: 2, text: '2' },
      ],
      [
        { value: 'z', text: 'z' },
        { value: 3, text: '3' },
      ],
    ]);
  });

  it('生値 value は型を保持する(数値は number のまま)', () => {
    const data = buildGridExportData({
      getRow,
      startRow: 0,
      endRow: 1,
      columns,
    });
    expect(typeof data.rows[0][1].value).toBe('number');
    expect(data.rows[0][1].value).toBe(1);
  });

  it('title 未指定の列は key をヘッダーに使う', () => {
    const cols: GridColumn<Row>[] = [{ key: 'a', width: 100 }];
    const data = buildGridExportData({
      getRow,
      startRow: 0,
      endRow: 1,
      columns: cols,
    });
    expect(data.columns).toEqual([{ key: 'a', title: 'a' }]);
  });

  it('レンジ [startRow, endRow) は end 排他', () => {
    const data = buildGridExportData({
      getRow,
      startRow: 1,
      endRow: 2,
      columns,
    });
    expect(data.rows).toEqual([
      [
        { value: 'y', text: 'y' },
        { value: 2, text: '2' },
      ],
    ]);
  });

  it('formatClipboardValue があれば text に反映する(value は生値のまま)', () => {
    const cols: GridColumn<Row>[] = [
      {
        key: 'b',
        title: 'B',
        width: 100,
        formatClipboardValue: (value) => `JPY${String(value)}`,
      },
    ];
    const data = buildGridExportData({
      getRow,
      startRow: 0,
      endRow: 1,
      columns: cols,
    });
    expect(data.rows[0][0]).toEqual({ value: 1, text: 'JPY1' });
  });

  it('getValue で算出した値を value/text に使う', () => {
    const cols: GridColumn<Row>[] = [
      { key: 'sum', title: 'Sum', width: 100, getValue: (row) => row.b * 10 },
    ];
    const data = buildGridExportData({
      getRow,
      startRow: 0,
      endRow: 1,
      columns: cols,
    });
    expect(data.rows[0][0]).toEqual({ value: 10, text: '10' });
  });

  it('null/undefined のセルは text が空文字になる', () => {
    const cols: GridColumn<Row>[] = [{ key: 'c', title: 'C', width: 100 }];
    const data = buildGridExportData({
      getRow,
      startRow: 0,
      endRow: 1,
      columns: cols,
    });
    expect(data.rows[0][0]).toEqual({ value: undefined, text: '' });
  });

  it('未ロード行(undefined)をスキップする(SSRM)', () => {
    const sparse: (Row | undefined)[] = [
      { a: 'x', b: 1 },
      undefined,
      { a: 'z', b: 3 },
    ];
    const data = buildGridExportData({
      getRow: (i: number): Row => sparse[i] as Row,
      startRow: 0,
      endRow: 3,
      columns,
    });
    expect(data.rows).toEqual([
      [
        { value: 'x', text: 'x' },
        { value: 1, text: '1' },
      ],
      [
        { value: 'z', text: 'z' },
        { value: 3, text: '3' },
      ],
    ]);
  });
});