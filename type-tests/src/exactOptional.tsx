// 追加(1.0.2 / 2026-11-09 実アプリの総点検 K-08): `exactOptionalPropertyTypes`(@tsconfig/strictest など)でも、省略可の
//   prop や列定義の項目へ undefined を渡せること(型の検査は scripts/check-types.mjs がこの設定を有効にして行う)。
import { SpreadsheetGrid, restoreColumnsFromState } from '@ishibashi0112/spreadsheet-grid';
import type { GridColumn, GridDensity, SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar, type GridAsk } from '@ishibashi0112/spreadsheet-grid/ai';
import { createSpreadsheetGrid, findFeature, standardFeatures } from '@ishibashi0112/spreadsheet-grid/lite';

type Row = { id: number; name: string };

declare const compact: boolean;
declare const density: GridDensity | undefined;
declare const ask: GridAsk;

export const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 120, minWidth: compact ? 80 : undefined, pinned: compact ? 'left' : undefined },
];

export const props: Partial<SpreadsheetGridProps<Row>> = {
  density,
  height: compact ? 300 : undefined,
  onScroll: compact ? undefined : () => {},
};

export const grid = (
  <SpreadsheetGrid<Row>
    rows={[]}
    columns={columns}
    rowKeyGetter={(row) => row.id}
    density={compact ? 'compact' : undefined}
    detailRow={compact ? undefined : { render: () => null }}
    localeText={undefined}
  />
);

export const askBar = (
  <GridAskBar<Row> grid={{ current: null }} columns={columns} ask={ask} columnHints={compact ? undefined : {}} />
);

// 追加(1.0.2 の確かめ直し): 保存した列の状態を戻す関数へ、列定義(`visible` / `pinned` が `| undefined`)をそのまま渡せる。
export const restored: GridColumn<Row>[] = restoreColumnsFromState(columns, null);

// 追加(1.0.2 の確かめ直し): /lite の機能の表も、機能を外すときに undefined を書ける。
export const LiteGrid = createSpreadsheetGrid({ features: { ...standardFeatures, find: compact ? undefined : findFeature } });