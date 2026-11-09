// CommonJS のファイルから nodenext で読む形(TypeScript 5.8 以上で通ること)。
import { SpreadsheetGrid, numberFormatter } from '@ishibashi0112/spreadsheet-grid';
import type { GridColumn } from '@ishibashi0112/spreadsheet-grid';
import { createSpreadsheetGrid, standardFeatures } from '@ishibashi0112/spreadsheet-grid/lite';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';

type Row = { id: number; amount: number };

export const Grid = SpreadsheetGrid;
export const LiteGrid = createSpreadsheetGrid({ features: standardFeatures });
export const columns: GridColumn<Row>[] = [{ key: 'amount', width: 100, valueFormatter: numberFormatter() }];
export const english = localeTextEn;