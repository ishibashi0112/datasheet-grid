import { type GridColumn, type CellValueFormatter, type SpreadsheetGridHandle, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid-solid';
export type Item = {
    id: number;
    name: string;
    qty: number;
};
export declare const itemColumns: GridColumn<Item>[];
export declare const qtyFormatter: CellValueFormatter<Item>;
export declare const LiteGrid: <T extends object, L extends T = T>(labelTypedProps: SpreadsheetGridProps<T, L>) => import("@solidjs/web").JSX.Element;
export declare const myFeatures: {
    filtering: import("@ishibashi0112/spreadsheet-grid-solid").GridFeature<"filtering">;
    columnMenu: import("@ishibashi0112/spreadsheet-grid-solid").GridFeature<"columnMenu">;
    toolPanel: import("@ishibashi0112/spreadsheet-grid-solid").GridFeature<"toolPanel">;
    columnAutosize: import("@ishibashi0112/spreadsheet-grid-solid").GridFeature<"columnAutosize">;
    export: import("@ishibashi0112/spreadsheet-grid-solid").GridFeature<"export">;
    fillHandle: import("@ishibashi0112/spreadsheet-grid-solid").GridFeature<"fillHandle">;
};
export declare function InventoryTable(props: {
    rows: Item[];
    ref?: (h: SpreadsheetGridHandle<Item>) => void;
}): import("@solidjs/web").JSX.Element;
export declare function MyGrid<T extends object>(props: SpreadsheetGridProps<T>): import("@solidjs/web").JSX.Element;
export declare const readState: (h: SpreadsheetGridHandle<Item>) => import("@ishibashi0112/spreadsheet-grid-solid").GridState;
export declare const readSelection: (h: SpreadsheetGridHandle<Item>) => import("@ishibashi0112/spreadsheet-grid-solid").GridSelection;
export declare const readActive: (h: SpreadsheetGridHandle<Item>) => import("@ishibashi0112/spreadsheet-grid-solid").CellCoord | null;
export declare const readExport: (h: SpreadsheetGridHandle<Item>) => import("@ishibashi0112/spreadsheet-grid-solid").GridExportData;
export declare const readInvalid: (h: SpreadsheetGridHandle<Item>) => import("@ishibashi0112/spreadsheet-grid-solid").GridInvalidCell[];
