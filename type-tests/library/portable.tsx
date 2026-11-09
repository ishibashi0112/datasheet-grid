// d.ts を出すライブラリの形(React 版だけに依存。core を直接の依存に入れなくても d.ts を出せること)。
//   推論のまま export して、tsc が型に名前を付けられること(TS2883 / TS2742 にならない)と、出した d.ts が
//   core の内部のパスや dist のパスを指さないことを check-types.mjs が確かめます。
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid';
import {
  createSpreadsheetGrid,
  findFeature,
  rowDragFeature,
  serverSideFeature,
  standardFeatures,
} from '@ishibashi0112/spreadsheet-grid/lite';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';

type Row = { id: number; name: string; amount: number };

// 機能の組み合わせ(社内の共通部品の形)
export const companyFeatures = { ...standardFeatures, find: findFeature, rowDrag: rowDragFeature };
export const serverFeatures = { ...companyFeatures, serverSide: serverSideFeature };
export const preset = standardFeatures;
export const CompanyGrid = createSpreadsheetGrid({ features: companyFeatures });

// ハンドルを包むヘルパー(戻り値は推論)
export function readGrid(handle: SpreadsheetGridHandle<Row>) {
  return {
    state: handle.getState(),
    selection: handle.getSelection(),
    active: handle.getActiveCell(),
    data: handle.getExportData(),
    invalid: handle.getInvalidCells(),
    selectedRows: handle.getSelectedRowData(),
    scroll: handle.getScrollPosition(),
  };
}
export const snapshot = (handle: SpreadsheetGridHandle<Row>) => handle.getState();

// props を包むコンポーネント
export function EnglishGrid(props: SpreadsheetGridProps<Row>) {
  return <SpreadsheetGrid {...props} localeText={localeTextEn} />;
}
export const Grid = SpreadsheetGrid;
export const english = localeTextEn;
export const defaults = { rowKeyGetter: (row: Row) => row.id, enableColumnFilter: true } satisfies Partial<SpreadsheetGridProps<Row>>;
export const columnKeys = (columns: GridColumn<Row>[]) => columns.map((column) => column.key);