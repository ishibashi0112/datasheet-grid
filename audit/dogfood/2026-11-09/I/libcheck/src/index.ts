// グリッドを包むライブラリの形: 推論した型のまま export する
import { useGridAsk, createGridAskRequest, readGridAskAnswer, describeGridAskView, type GridAsk } from '@ishibashi0112/spreadsheet-grid/ai';
import type { GridColumn, SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import { gridAskLocaleTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';

type Row = { id: number; amount: number };
export const columns: GridColumn<Row>[] = [{ key: 'amount', title: '金額', width: 100, filterType: 'number' }];
export const buildRequest = (text: string, grid: SpreadsheetGridHandle<Row>) => createGridAskRequest(text, grid.getState(), { columns });
export const readAnswer = (answer: unknown, grid: SpreadsheetGridHandle<Row>) => readGridAskAnswer(answer, grid.getState(), { columns });
export const chips = (grid: SpreadsheetGridHandle<Row>) => describeGridAskView(grid.getState(), { columns });
export const useSalesAsk = (grid: { current: SpreadsheetGridHandle<Row> | null }, ask: GridAsk) => useGridAsk({ grid, columns, ask, localeText: gridAskLocaleTextEn });
export const en = gridAskLocaleTextEn;
export const op = readGridAskAnswer;
