// 列定義・エディタ・書式・ラベル行の型。正しい書き方が通り、間違いが型エラーになることを確かめます。
import { SpreadsheetGrid, numberFormatter, numberParser, restoreColumnsFromState } from '@ishibashi0112/spreadsheet-grid';
import type {
  CellRenderContext,
  GridPasteSkippedParams,
  CellValueFormatter,
  GridColumn,
  GridColumnPinned,
  GridPinnedRowPosition,
  LabelRowOptions,
  SpreadsheetGridProps,
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
      // 追加(1.1.0 / 固定行): 固定行のセルでは 'top' / 'bottom'、本体の行では undefined。
      assertType<Equal<typeof ctx.pinned, GridPinnedRowPosition | undefined>>();
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
// select の options と getFilterOptions の結果に readonly の配列(`as const`)も渡せる(1.3.0 / S4-05)
const STATUS_OPTIONS = [
  { value: 'open', label: '受付' },
  { value: 'done', label: '完了' },
] as const;
export const readonlySelect: GridColumn<Sale> = { key: 'name', width: 100, editor: { type: 'select', options: STATUS_OPTIONS } };
export const readonlySelectByRow: GridColumn<Sale> = {
  key: 'name',
  width: 100,
  editor: { type: 'select', options: () => STATUS_OPTIONS },
};
export const readonlyFilterOptions: SpreadsheetGridProps<Sale>['getFilterOptions'] = async () => ({ options: STATUS_OPTIONS });

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

// 1.1.0: 値と表示名(groupLabel / select の clipboard / globalFilterMatch)、数値のパーサ(numberParser)、貼り付けで書かなかったセルの通知
export const labelColumns: GridColumn<Sale>[] = [
  {
    key: 'name',
    title: '区分',
    width: 120,
    editor: { type: 'select', options: [{ value: 'a', label: 'A' }], clipboard: 'label' },
    groupLabel: 'formatted',
  },
  { key: 'amount', title: '金額', width: 120, parseClipboardValue: numberParser({ strip: ['¥', '円'], negativeParentheses: true }) },
  { key: 'date', title: '日付', width: 120, groupLabel: ({ value, row }) => `${String(value)} ${row?.name ?? ''}` },
  // @ts-expect-error clipboard は 'value' か 'label'
  { key: 'id', title: 'ID', width: 80, editor: { type: 'select', options: [], clipboard: 'text' } },
  // @ts-expect-error groupLabel は 'value' / 'formatted' / 関数
  { key: 'id', title: 'ID', width: 80, groupLabel: 'display' },
];
export const otherAmount: GridColumn<Other> = { key: 'price', width: 100, parseClipboardValue: numberParser() };
export const valueLabelGrid = (
  <SpreadsheetGrid<Sale>
    rows={[]}
    columns={labelColumns}
    globalFilterMatch="both"
    onPasteSkipped={({ cells }: GridPasteSkippedParams<Sale>) => {
      for (const cell of cells) {
        assertType<Equal<typeof cell.row, Sale>>();
        assertType<Equal<typeof cell.reason, 'readOnly' | 'invalid'>>();
      }
    }}
  />
);
// @ts-expect-error globalFilterMatch は 'value' / 'display' / 'both'
export const badMatch = <SpreadsheetGrid<Sale> rows={[]} columns={labelColumns} globalFilterMatch="label" />;
// 1.1.0: ポップアップを描く場所(popupContainer)
export const popupGrids = [
  <SpreadsheetGrid<Sale> key="a" rows={[]} columns={labelColumns} popupContainer="body" />,
  <SpreadsheetGrid<Sale> key="b" rows={[]} columns={labelColumns} popupContainer={(grid) => grid.closest('main')} />,
  // @ts-expect-error popupContainer は 'auto' / 'body' / 要素 / 関数
  <SpreadsheetGrid<Sale> key="c" rows={[]} columns={labelColumns} popupContainer="dialog" />,
];

// 追加(1.1.0 / 固定行): 固定行は本体と同じ行の型。違う型の行は渡せない。
export const pinnedGrid = (
  <SpreadsheetGrid<Sale>
    rows={[]}
    columns={saleColumns}
    rowKeyGetter={(row) => row.id}
    pinnedTopRows={[{ kind: 'sale', id: -1, name: '目標', amount: 100, date: '' }]}
    pinnedBottomRows={[]}
  />
);
export const pinnedPosition: GridPinnedRowPosition = 'bottom';
// @ts-expect-error 固定行の位置は 'top' / 'bottom' だけ
export const wrongPinnedPosition: GridPinnedRowPosition = 'left';
export const wrongPinnedRows = (
  // @ts-expect-error 固定行の行の型は本体の行の型と同じ
  <SpreadsheetGrid<Sale> rows={[]} columns={saleColumns} rowKeyGetter={(row) => row.id} pinnedTopRows={[{ code: 'x', price: 1 }]} />
);