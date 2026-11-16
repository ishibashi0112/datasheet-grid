// 1.2.0 で足した型。正しい書き方が通り、間違いが型エラーになることを確かめます(`exactOptionalPropertyTypes` でも)。
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import type {
  FindChangeParams,
  GridColumn,
  GridColumnState,
  GridGroupRow,
  GridScrollEventParams,
  GridState,
  RowDropParams,
  SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import { assertType, type Equal } from './expect.js';

type Item = { id: number; jan: string; price: number; date: string; maker: string };

declare const handle: SpreadsheetGridHandle<Item>;
declare const flag: boolean;

// 列の selectionAggregate / number・date エディタの strict / custom エディタの imeDirectInput
export const columns: GridColumn<Item>[] = [
  { key: 'jan', title: 'JAN', width: 140, selectionAggregate: false },
  { key: 'price', title: '価格', width: 100, editor: { type: 'number', strict: true } },
  { key: 'date', title: '日付', width: 120, editor: { type: 'date', strict: flag ? true : undefined } },
  {
    key: 'maker',
    title: 'メーカー',
    width: 140,
    editor: {
      type: 'custom',
      imeDirectInput: true,
      render: (ctx) => {
        assertType<Equal<typeof ctx.initialText, string>>();
        return null;
      },
    },
  },
];
// @ts-expect-error strict は boolean
export const badStrict: GridColumn<Item> = { key: 'price', width: 100, editor: { type: 'number', strict: 'yes' } };

// 行ドラッグの落とせる先
export const canDropRow = (params: RowDropParams<Item>): boolean => {
  assertType<Equal<typeof params.rowAbove, Item | undefined>>();
  assertType<Equal<typeof params.rows, readonly Item[]>>();
  return params.toIndex >= 2;
};

export const grid = (
  <SpreadsheetGrid<Item>
    rows={[]}
    columns={columns}
    rowKeyGetter={(row) => row.id}
    activeCellFollows="row"
    pasteFillsSelection={false}
    includeGroupingInState
    pinnedBottomRowsPlacement="belowTotal"
    enableRowDrag
    canDropRow={canDropRow}
    onScroll={(params) => {
      assertType<Equal<typeof params.atBottom, boolean | undefined>>();
    }}
    onFindChange={(params) => {
      assertType<Equal<typeof params.truncated, boolean | undefined>>();
    }}
  />
);
export const optional = (
  <SpreadsheetGrid<Item>
    rows={[]}
    columns={columns}
    activeCellFollows={flag ? 'position' : undefined}
    pinnedBottomRowsPlacement={flag ? 'aboveTotal' : undefined}
    pasteFillsSelection={flag ? undefined : true}
    canDropRow={flag ? undefined : canDropRow}
  />
);
// @ts-expect-error activeCellFollows は 'position' / 'row'
export const badFollows = <SpreadsheetGrid<Item> rows={[]} columns={columns} activeCellFollows="key" />;
// @ts-expect-error pinnedBottomRowsPlacement は 'aboveTotal' / 'belowTotal'
export const badPlacement = <SpreadsheetGrid<Item> rows={[]} columns={columns} pinnedBottomRowsPlacement="bottom" />;

// ハンドルの isAtBottom() / getGroupRows() の collapsed
assertType<Equal<ReturnType<typeof handle.isAtBottom>, boolean>>();
export const collapsed: boolean | undefined = (handle.getGroupRows()[0] as GridGroupRow | undefined)?.collapsed;

// 自分で作る値は、増えた項目(truncated / atBottom)を書かなくてよい
export const initialFind: FindChangeParams = { query: '', matchCount: 0, currentIndex: null, open: false };
export const initialScroll: GridScrollEventParams = { top: 0, left: 0, source: 'user' };

// 状態の rowGroup / collapsedGroups
export const savedColumn: GridColumnState = { key: 'maker', rowGroup: true };
export const saved: Pick<GridState, 'collapsedGroups'> = { collapsedGroups: flag ? undefined : ['maker:A'] };