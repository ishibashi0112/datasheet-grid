// 追加(本体分解 E-2): 行モデルパイプラインのリゾルバの単体テストです。旧 SpreadsheetGrid.tsx の useMemo 群と
//   同じ結果(フィルター → ソート → 恒等判定 / グルーピング RowModel / serverSide query)と、no-op 入力での
//   参照安定(order / rowModel が不変)を検証します。
import { describe, it, expect } from 'vitest';
import { createRowPipelineResolver } from './rowPipeline';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { id: number; name: string; amount: number; group: string };

const rows: Row[] = [
  { id: 1, name: 'c', amount: 30, group: 'x' },
  { id: 2, name: 'a', amount: 10, group: 'y' },
  { id: 3, name: 'b', amount: 20, group: 'x' },
];
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名前', width: 120 },
  { key: 'amount', title: '金額', width: 100, filterType: 'number' },
  { key: 'group', title: 'グループ', width: 100 },
];
const rowKeyGetter = (row: Row) => row.id;

describe('createRowPipelineResolver.resolveOrder', () => {
  it('フィルターなし・ソートなしでは恒等 order で rowDragOperable=true、no-op 入力で参照不変', () => {
    const pipeline = createRowPipelineResolver<Row>();
    const baseOrder = pipeline.resolveBaseOrder(rows.length);
    const inputs = {
      rows,
      visibleColumns: columns,
      columnFilters: {},
      globalFilteredOrder: baseOrder,
      sort: [],
      rowDragAvailable: true,
    };
    const first = pipeline.resolveOrder(inputs);
    expect(Array.from(first.order)).toEqual([0, 1, 2]);
    expect(first.orderIsIdentity).toBe(true);
    expect(first.rowDragOperable).toBe(true);
    const second = pipeline.resolveOrder({ ...inputs });
    expect(second.order).toBe(first.order);
    expect(pipeline.resolveBaseOrder(rows.length)).toBe(baseOrder);
  });

  it('number フィルター(Float64 key 経路)とソートを適用し、非恒等なら rowDragOperable=false', () => {
    const pipeline = createRowPipelineResolver<Row>();
    const baseOrder = pipeline.resolveBaseOrder(rows.length);
    const result = pipeline.resolveOrder({
      rows,
      visibleColumns: columns,
      columnFilters: {
        amount: {
          kind: 'number',
          raw: '>=20',
          parsed: { mode: 'comparison', operator: '>=', value: 20 },
        },
      },
      globalFilteredOrder: baseOrder,
      sort: [{ columnKey: 'name', direction: 'asc' }],
      rowDragAvailable: true,
    });
    // amount>=20 は id 1(c) / 3(b)。name 昇順で b → c = source index [2, 0]。
    expect(Array.from(result.order)).toEqual([2, 0]);
    expect(result.orderIsIdentity).toBe(false);
    expect(result.rowDragOperable).toBe(false);
  });
});

describe('createRowPipelineResolver.resolveClientSideRowModel', () => {
  it('グルーピング無効では order 直参照の RowModel(getGroupRow なし)、no-op 入力で参照不変', () => {
    const pipeline = createRowPipelineResolver<Row>();
    const order = pipeline.resolveBaseOrder(rows.length);
    const inputs = {
      rows,
      order,
      rowGroupingActive: false,
      groupColumns: [],
      aggColumns: [],
      collapsedGroupKeys: new Set<string>(),
      rowKeyGetter,
    };
    const first = pipeline.resolveClientSideRowModel(inputs);
    expect(first.groupTree).toBeNull();
    expect(first.groupedDisplay).toBeNull();
    expect(first.rowModel.getRowCount()).toBe(3);
    expect(first.rowModel.getRow(1)).toBe(rows[1]);
    expect(first.rowModel.getSourceIndex(2)).toBe(2);
    expect(first.rowModel.getRowKey(0)).toBe(1);
    expect(first.rowModel.getGroupRow).toBeUndefined();
    expect(pipeline.resolveClientSideRowModel({ ...inputs }).rowModel).toBe(first.rowModel);
  });

  it('グルーピング有効ではグループ行を含む表示リストになり、開閉で rowModel だけが変わる', () => {
    const pipeline = createRowPipelineResolver<Row>();
    const order = pipeline.resolveBaseOrder(rows.length);
    const groupColumns: GridColumn<Row>[] = [{ key: 'group', title: 'グループ', width: 100, rowGroup: true }];
    // groupTree は開閉状態に依存しないため、開閉以外の入力を固定すれば参照が保たれる(aggColumns も同一参照)。
    const aggColumns: GridColumn<Row>[] = [];
    const expanded = pipeline.resolveClientSideRowModel({
      rows,
      order,
      rowGroupingActive: true,
      groupColumns,
      aggColumns,
      collapsedGroupKeys: new Set<string>(),
      rowKeyGetter,
    });
    // x(1, 3) / y(2) = グループ行 2 + leaf 3。
    expect(expanded.groupTree?.groupCount).toBe(2);
    expect(expanded.rowModel.getRowCount()).toBe(5);
    const groupRow = expanded.rowModel.getGroupRow?.(0);
    expect(groupRow?.groupKey).toBeDefined();
    expect(expanded.rowModel.getSourceIndex(0)).toBeUndefined();
    expect(expanded.rowModel.getRow(1)).toBe(rows[0]);

    const collapsed = pipeline.resolveClientSideRowModel({
      rows,
      order,
      rowGroupingActive: true,
      groupColumns,
      aggColumns,
      collapsedGroupKeys: new Set([groupRow!.groupKey]),
      rowKeyGetter,
    });
    expect(collapsed.groupTree).toBe(expanded.groupTree);
    expect(collapsed.rowModel.getRowCount()).toBe(3);
  });
});

describe('createRowPipelineResolver.resolveServerSideQuery', () => {
  it('clientSide では空 query / 空 key、serverSide では UI 状態から組み立て、無効化された要素は落とす', () => {
    const pipeline = createRowPipelineResolver<Row>();
    const client = pipeline.resolveServerSideQuery({
      isServerSide: false,
      globalFilterEnabled: true,
      globalText: 'abc',
      columnFilterEnabled: true,
      columnFilters: {},
      sortingEnabled: true,
      sort: [{ columnKey: 'name', direction: 'asc' }],
    });
    expect(client.query).toEqual({});
    expect(client.queryKey).toBe('');

    const server = pipeline.resolveServerSideQuery({
      isServerSide: true,
      globalFilterEnabled: true,
      globalText: 'abc',
      columnFilterEnabled: true,
      columnFilters: {},
      sortingEnabled: false,
      sort: [{ columnKey: 'name', direction: 'asc' }],
    });
    expect(server.query.globalText).toBe('abc');
    expect(server.query.sort).toBeUndefined();
    expect(server.queryKey.length).toBeGreaterThan(0);
    // 同じ入力なら pair の参照も不変。
    expect(
      pipeline.resolveServerSideQuery({
        isServerSide: true,
        globalFilterEnabled: true,
        globalText: 'abc',
        columnFilterEnabled: true,
        columnFilters: {},
        sortingEnabled: false,
        sort: [{ columnKey: 'name', direction: 'asc' }],
      }),
    ).not.toBe(server);
  });
});