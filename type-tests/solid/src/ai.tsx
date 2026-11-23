// Solid 版の /ai の型(段 3-1)。React 版の useGridAsk は Solid の慣例の名前で createGridAsk、grid はハンドルかそれを返す関数。
import { createSignal } from 'solid-js';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid';
import type { GridColumn, GridState, SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid';
import { GridAskBar, createGridAsk, createGridAskRequest, readGridAskAnswer } from '@ishibashi0112/spreadsheet-grid-solid/ai';
import type { CreateGridAskResult, GridAsk, GridAskLocaleText, GridAskRequest } from '@ishibashi0112/spreadsheet-grid-solid/ai';
import { gridAskLocaleTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en';
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

// 変数の ref と、ハンドルを返す関数
export function AskGrid(props: { rows: Row[] }) {
  // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
  let grid!: SpreadsheetGridHandle<Row>;
  const result = createGridAsk({ grid: () => grid, columns, ask });
  assertType<Equal<typeof result, CreateGridAskResult>>();
  return (
    <>
      <GridAskBar grid={() => grid} columns={columns} ask={ask} examples={['価格の高い順']} theme="auto" />
      {/* @ts-expect-error ask は必須 */}
      <GridAskBar grid={() => grid} columns={columns} />
      <SpreadsheetGrid ref={grid} rows={props.rows} columns={columns} rowKeyGetter={(row) => row.id} />
    </>
  );
}

// signal の setter を ref に渡す形(ハンドルそのものも渡せる)
export function SignalGrid(props: { rows: Row[] }) {
  const [handle, setHandle] = createSignal<SpreadsheetGridHandle<Row>>();
  return (
    <>
      <GridAskBar grid={handle} columns={columns} ask={ask} localeText={gridAskLocaleTextEn} />
      <SpreadsheetGrid ref={setHandle} rows={props.rows} columns={columns} />
    </>
  );
}

export const status = (result: CreateGridAskResult) => {
  assertType<Equal<typeof result.status, 'idle' | 'asking'>>();
  // @ts-expect-error 結果の値は読むだけ
  result.status = 'idle';
};

// @ts-expect-error React の ref オブジェクトは渡せない(ハンドルか、それを返す関数)
export const refObject = () => <GridAskBar grid={{ current: null }} columns={columns} ask={ask} />;

export const english: GridAskLocaleText = gridAskLocaleTextEn;
const state: GridState = { version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] };
export const request = createGridAskRequest('価格の高い順', state, { columns });
export const answer = readGridAskAnswer({}, state, { columns });