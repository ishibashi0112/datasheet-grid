// 追加(1.0.1 / 実アプリの総点検 AP-06): サーバーの描画(renderToString)で現在時刻を読まないことのテストです。
//   Next.js 16 の既定(cacheComponents)は描画中の new Date() / Date.now() を見つけると `next build` を止める
//   (1.0.0 は日付の変わり目の見張りと列フィルターの段が、フィルターを使っていなくても new Date() を読んでいた)。
//   日付の列の条件を initialState で入れたときは条件を解くのに読む(ドキュメントに記載)。node 環境で実行します。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string; qty: number; due: string; status: string };
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3, due: '2026-01-02', status: 'open' },
  { id: 2, name: 'beta', qty: 1, due: '2026-02-03', status: 'done' },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text', editor: { type: 'text' } },
  { key: 'qty', title: '数量', width: 100, filterType: 'number', aggFunc: 'sum', conditionalFormat: { dataBar: {} } },
  { key: 'due', title: '期日', width: 120, filterType: 'date', editor: { type: 'date' } },
  { key: 'status', title: '状態', width: 120, filterType: 'set', conditionalFormat: { chips: { done: { tone: 'good' } } } },
];

const RealDate = Date;
let currentTimeReads: string[] = [];

beforeEach(() => {
  currentTimeReads = [];
  class TrackedDate extends RealDate {
    constructor(...args: ConstructorParameters<DateConstructor> | []) {
      if (args.length === 0) {
        currentTimeReads.push(new Error('new Date()').stack ?? 'new Date()');
        super();
      } else {
        super(...(args as ConstructorParameters<DateConstructor>));
      }
    }
    static now(): number {
      currentTimeReads.push(new Error('Date.now()').stack ?? 'Date.now()');
      return RealDate.now();
    }
  }
  globalThis.Date = TrackedDate as DateConstructor;
});
afterEach(() => {
  globalThis.Date = RealDate;
});

describe('サーバーの描画で現在時刻を読まない(AP-06)', () => {
  it('既定の構成と、主な機能を有効にした構成', () => {
    renderToString(<SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} onRowsChange={() => {}} />);
    renderToString(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={() => {}}
        enableColumnFilter
        enableGlobalFilter
        showFilterChipBar
        totalRow
        find
        enableRowSelection
        enableColumnMenu
        fillHandle
        imeDirectInput
        highlightChanges
        autoSizeColumns="onMount"
        initialState={{
          filters: { columnFilters: { name: { kind: 'text', value: 'a' } } },
          sort: [{ columnKey: 'qty', direction: 'desc' }],
        }}
      />,
    );
    expect(currentTimeReads).toEqual([]);
  });
});