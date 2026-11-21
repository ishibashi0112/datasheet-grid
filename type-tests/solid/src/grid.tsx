// Solid 版(@ishibashi0112/spreadsheet-grid-solid)の型。React 版と同じ列定義・props が通り、Solid の形(JSX.Element /
//   関数の ref)で書けること、間違いが型エラーになることを確かめます(check-types.mjs の Solid 版の検査)。
import type { JSX } from '@solidjs/web';
import {
  SpreadsheetGrid,
  createSpreadsheetGrid,
  exportFeature,
  findFeature,
  numberFormatter,
  numberParser,
  restoreColumnsFromState,
  serverSideFeature,
  standardFeatures,
} from '@ishibashi0112/spreadsheet-grid-solid';
import type {
  CellRenderContext,
  GridColumn,
  GridFeatures,
  GridState,
  LabelRowOptions,
  ServerSideDataSource,
  SolidGridTypes,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid-solid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-solid/testing';
import { assertType, expectAssignable, type Equal } from './expect.js';

type Sale = { kind: 'sale'; id: number; name: string; amount: number };
type Month = { kind: 'label'; id: number; label: string };
type Row = Sale | Month;

// 描画の型は Solid の JSX.Element / JSX.CSSProperties
assertType<Equal<SolidGridTypes['node'], JSX.Element>>();
assertType<Equal<SolidGridTypes['style'], JSX.CSSProperties>>();

export const columns: GridColumn<Sale>[] = [
  { key: 'name', title: '名前', width: 160, editor: { type: 'text' } },
  { key: 'amount', title: '金額', width: 120, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: numberFormatter() },
  {
    key: 'id',
    width: 80,
    renderCell: (ctx) => {
      assertType<Equal<typeof ctx, CellRenderContext<Sale>>>();
      return <span class="id">{ctx.row.id}</span>;
    },
    parseClipboardValue: numberParser(),
  },
];
// @ts-expect-error width は必須
export const missingWidth: GridColumn<Sale> = { key: 'name' };
// @ts-expect-error エディタの種類の打ち間違い
export const wrongEditor: GridColumn<Sale> = { key: 'name', width: 100, editor: { type: 'txt' } };
// Solid の style は JSX.CSSProperties(CSS の名前のまま)
export const style: SpreadsheetGridProps<Sale>['style'] = { 'max-width': '100%' };
// @ts-expect-error React の camelCase の style は書けない
export const reactStyle: SpreadsheetGridProps<Sale>['style'] = { maxWidth: '100%' };
export const slot: SpreadsheetGridProps<Sale>['classNames'] = { root: { className: 'my-grid', style: { 'border-radius': '8px' } } };

// ラベル行: 型ガードで L が決まり、getLabel の row がラベル行の型になる(React 版と同じ)
export const labelRow: LabelRowOptions<Row, Month> = {
  isLabelRow: (row): row is Month => row.kind === 'label',
  getLabel: (row) => {
    assertType<Equal<typeof row, Month>>();
    return row.label;
  },
};

// ref は関数(Solid の形)。ハンドルは React 版と同じ
let handle: SpreadsheetGridHandle<Sale> | undefined;
export const grid = (rows: Sale[]) => (
  <SpreadsheetGrid<Sale>
    ref={(h) => {
      handle = h;
    }}
    rows={rows}
    columns={columns}
    rowKeyGetter={(row) => row.id}
    onRowsChange={(next) => expectAssignable<Sale[]>(next)}
    localeText={localeTextEn}
    height={400}
  />
);
export const state = (): GridState | undefined => handle?.getState();
export const restored = (saved: GridState) => restoreColumnsFromState(columns, saved);

export const refObject = (rows: Sale[]) => (
  // @ts-expect-error React の ref オブジェクトは渡せない(Solid の ref は関数)
  <SpreadsheetGrid<Sale> ref={{ current: null }} rows={rows} columns={columns} />
);

// 機能を選んで組み込む(React 版の /lite と同じ形)
const features = { ...standardFeatures, find: findFeature } satisfies GridFeatures;
export const LiteGrid = createSpreadsheetGrid({ features });
export const lite = (rows: Sale[]) => <LiteGrid rows={rows} columns={columns} find />;
// @ts-expect-error 機能の部品は決まったキーにだけ入る
export const wrongKey = createSpreadsheetGrid({ features: { find: exportFeature } });

// SSRM
const dataSource: ServerSideDataSource<Sale> = {
  getRows: async () => ({ rows: [], totalRowCount: 0 }),
};
export const ServerGrid = createSpreadsheetGrid({ features: { serverSide: serverSideFeature } });
export const server = () => <ServerGrid dataSource={dataSource} columns={columns} rowKeyGetter={(row: Sale) => row.id} />;

// props を包む部品
export function EnglishGrid(props: SpreadsheetGridProps<Sale>) {
  return <SpreadsheetGrid {...props} localeText={localeTextEn} />;
}

// テスト用のレイアウトスタブ(React 版の /testing と同じ)
export const stubs = installJsdomLayoutStubs;