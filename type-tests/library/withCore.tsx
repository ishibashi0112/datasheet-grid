// d.ts を出すライブラリの形(公開型のプロパティや core の関数の戻り値を推論のまま export する)。
//   このとき d.ts は core の入口(@ishibashi0112/spreadsheet-grid-core。semver の対象)の名前を書くので、
//   ライブラリは core も同じ版で依存に入れます(ドキュメントに記載)。core の内部のパス・dist のパスを指さないことを
//   check-types.mjs が確かめます。
import { numberFormatter, restoreColumnsFromState } from '@ishibashi0112/spreadsheet-grid';
import type { GridColumn, SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid';
import { createGridAskRequest, readGridAskAnswer } from '@ishibashi0112/spreadsheet-grid/ai';

type Row = { id: number; name: string; amount: number };

// 公開型のプロパティ
export const getColumns = (props: SpreadsheetGridProps<Row>) => props.columns;
export const getEditor = (column: GridColumn<Row>) => column.editor;
export const getRenderCell = (column: GridColumn<Row>) => column.renderCell;
export const getLabelRow = (props: SpreadsheetGridProps<Row>) => props.labelRow;
export const getDetailRow = (props: SpreadsheetGridProps<Row>) => props.detailRow;
export const getTotalRow = (props: SpreadsheetGridProps<Row>) => props.totalRow;
export const getDataSource = (props: SpreadsheetGridProps<Row>) => props.dataSource;
export const getOnCellClick = (props: SpreadsheetGridProps<Row>) => props.onCellClick;
export const getTopBar = (props: SpreadsheetGridProps<Row>) => props.renderTopBar;
export const getContextMenu = (props: SpreadsheetGridProps<Row>) => props.getContextMenuItems;

// core から再公開している関数
export const yen = numberFormatter({ maximumFractionDigits: 0 });
export const typedYen = numberFormatter<Row>();
export const restore = restoreColumnsFromState;
export const ask = createGridAskRequest;
export const read = readGridAskAnswer;