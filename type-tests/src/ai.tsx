// /ai と /testing の型。
import { useRef } from 'react';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import type { GridColumn, GridState, SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar, createGridAskRequest, readGridAskAnswer, useGridAsk } from '@ishibashi0112/spreadsheet-grid/ai';
import type { GridAsk, GridAskRequest, UseGridAskResult } from '@ishibashi0112/spreadsheet-grid/ai';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing';
import { assertType, type Equal } from './expect.js';

type Row = { id: number; name: string; price: number };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text' },
  { key: 'price', title: '価格', width: 100, filterType: 'number' },
];

const ask: GridAsk = async (request, { signal }) => {
  assertType<Equal<typeof request, GridAskRequest>>();
  const response = await fetch('/api/ask', { method: 'POST', body: JSON.stringify(request), signal });
  return response.json();
};

export function AskGrid({ rows }: { rows: Row[] }) {
  const grid = useRef<SpreadsheetGridHandle<Row>>(null);
  const result = useGridAsk({ grid, columns, ask });
  assertType<Equal<typeof result, UseGridAskResult>>();
  return (
    <>
      <GridAskBar grid={grid} columns={columns} ask={ask} examples={['価格の高い順']} theme="auto" />
      {/* @ts-expect-error ask は必須 */}
      <GridAskBar grid={grid} columns={columns} />
      <SpreadsheetGrid ref={grid} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />
    </>
  );
}

const state: GridState = { version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] };
export const request = createGridAskRequest('価格の高い順', state, { columns });
export const answer = readGridAskAnswer({}, state, { columns });
// @ts-expect-error 引数の順番の間違い
createGridAskRequest(state, '価格の高い順', { columns });
const restore: () => void = installJsdomLayoutStubs({ width: 800 });
restore();