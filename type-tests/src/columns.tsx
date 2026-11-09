// 列定義・エディタ・書式・ラベル行の型。正しい書き方が通り、間違いが型エラーになることを確かめます。
import { SpreadsheetGrid, numberFormatter, restoreColumnsFromState } from '@ishibashi0112/spreadsheet-grid';
import type {
  CellRenderContext,
  CellValueFormatter,
  GridColumn,
  GridColumnPinned,
  LabelRowOptions,
} from '@ishibashi0112/spreadsheet-grid';
import { assertType, expectAssignable, type Equal } from './expect.js';

type Sale = { kind: 'sale'; id: number; name: string; amount: number; date: string };
type Month = { kind: 'label'; id: number; label: string };
type Row = Sale | Month;
type Other = { code: string; price: number };

// エディタの種類
export const saleColumns: GridColumn<Sale>[] = [
  { key: 'name', title: '名前', width: 160, editor: { type: 'text', multiline: true, enterKey: 'newline' } },
  { key: 'amount', title: '金額', width: 120, align: 'right', editor: { type: 'number', min: 0, integer: true } },
  { key: 'date', title: '日付', width: 120, editor: { type: 'date' } },
  {
    key: 'id',
    title: 'ID',
    width: 80,
    renderCell: (ctx) => {
      assertType<Equal<typeof ctx, CellRenderContext<Sale>>>();
      return <span>{ctx.row.id}</span>;
    },
  },
];

// @ts-expect-error width は必須
export const missingWidth: GridColumn<Sale> = { key: 'name', title: '名前' };
// @ts-expect-error エディタの種類の打ち間違い
export const wrongEditor: GridColumn<Sale> = { key: 'name', width: 100, editor: { type: 'txt' } };
// @ts-expect-error number エディタに options は無い
export const wrongEditorOption: GridColumn<Sale> = { key: 'amount', width: 100, editor: { type: 'number', options: [] } };

// numberFormatter: 型引数なしで作ったものは、行の型の違う列で使い回せる
const shared = numberFormatter({ maximumFractionDigits: 0 });
export const otherColumns: GridColumn<Other>[] = [{ key: 'price', width: 100, valueFormatter: shared }];
export const reused: GridColumn<Sale>[] = [{ key: 'amount', width: 100, valueFormatter: shared }];
// 型引数を付けたものと、型の注釈
const typed = numberFormatter<Sale>();
export const typedColumns: GridColumn<Sale>[] = [{ key: 'amount', width: 100, valueFormatter: typed }];
export const annotated: CellValueFormatter<Sale> = numberFormatter();
// 書式の関数は行の無いセル(合計行 / グループ行)でも呼ばれるので row は T | undefined
export const formatter: CellValueFormatter<Sale> = ({ row, value }) => `${row?.name ?? ''} ${String(value)}`;

// ラベル行: 型ガードで L が決まり、getLabel の row がラベル行の型になる
export const labelRow: LabelRowOptions<Row, Month> = {
  isLabelRow: (row): row is Month => row.kind === 'label',
  getLabel: (row) => {
    assertType<Equal<typeof row, Month>>();
    return row.label;
  },
};
export const labelGrid = (
  <SpreadsheetGrid<Row, Month>
    rows={[]}
    columns={[{ key: 'id', width: 80 }]}
    rowKeyGetter={(row) => row.id}
    labelRow={{ isLabelRow: (row): row is Month => row.kind === 'label', getLabel: (row) => row.label }}
  />
);

// restoreColumnsFromState: 読み取り専用の配列も受け、渡した要素の型のまま返す
const baseColumns = [
  { key: 'name', width: 160 },
  { key: 'amount', width: 120, pinned: 'right' as GridColumnPinned },
] as const satisfies readonly GridColumn<Sale>[];
const restored = restoreColumnsFromState(baseColumns, null);
assertType<Equal<typeof restored, (typeof baseColumns)[number][]>>();
export const restoredColumns: GridColumn<Sale>[] = expectAssignable<GridColumn<Sale>[]>(restored);