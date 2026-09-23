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
// 追加(label-row ①): ラベル行の stage(配置 / ラベル行を除いた恒等 order / 恒等判定 / RowModel / グルーピング併用時のバイパス)。
describe('createRowPipelineResolver × ラベル行', () => {
  type LRow = { id: number; kind?: 'label'; name: string; amount: number };
  const labelRows: LRow[] = [
    { id: 100, kind: 'label', name: 'S1', amount: 0 },
    { id: 1, name: 'c', amount: 30 },
    { id: 2, name: 'a', amount: 10 },
    { id: 101, kind: 'label', name: 'S2', amount: 0 },
    { id: 3, name: 'b', amount: 20 },
  ];
  const labelColumns: GridColumn<LRow>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'name', title: '名前', width: 120 },
    { key: 'amount', title: '金額', width: 100, filterType: 'number' },
  ];
  const isLabelRow = (row: LRow) => row.kind === 'label';
  const getLabel = (row: LRow) => row.name;
  const keyGetter = (row: LRow) => row.id;

  it('resolveLabelRowLayout / resolveBaseOrder: ラベル行を除いた恒等 order(参照安定)', () => {
    const pipeline = createRowPipelineResolver<LRow>();
    const layout = pipeline.resolveLabelRowLayout(labelRows, isLabelRow);
    expect(layout).not.toBeNull();
    expect(Array.from(layout!.labelIndexes)).toEqual([0, 3]);
    const baseOrder = pipeline.resolveBaseOrder(labelRows.length, layout);
    expect(Array.from(baseOrder)).toEqual([1, 2, 4]);
    expect(pipeline.resolveBaseOrder(labelRows.length, layout)).toBe(baseOrder);
    expect(pipeline.resolveLabelRowLayout(labelRows, isLabelRow)).toBe(layout);
    // 述語なし / 該当なしは null で、従来の恒等 order。
    expect(pipeline.resolveLabelRowLayout(labelRows, undefined)).toBeNull();
    expect(Array.from(pipeline.resolveBaseOrder(labelRows.length, null))).toEqual([0, 1, 2, 3, 4]);
  });

  it('恒等判定: ソート / フィルターなしはラベル行込みでも rowDragOperable=true、ソートで false', () => {
    const pipeline = createRowPipelineResolver<LRow>();
    const layout = pipeline.resolveLabelRowLayout(labelRows, isLabelRow);
    const baseOrder = pipeline.resolveBaseOrder(labelRows.length, layout);
    const inputs = {
      rows: labelRows,
      labelLayout: layout,
      visibleColumns: labelColumns,
      columnFilters: {},
      globalFilteredOrder: baseOrder,
      sort: [],
      rowDragAvailable: true,
    };
    const identity = pipeline.resolveOrder(inputs);
    expect(identity.orderIsIdentity).toBe(true);
    expect(identity.rowDragOperable).toBe(true);
    const sorted = pipeline.resolveOrder({ ...inputs, sort: [{ columnKey: 'name', direction: 'asc' }] });
    expect(Array.from(sorted.order)).toEqual([2, 4, 1]);
    expect(sorted.rowDragOperable).toBe(false);
  });

  it('resolveClientSideRowModel: ラベル行込みの RowModel(セクション内ソート)と no-op 参照安定', () => {
    const pipeline = createRowPipelineResolver<LRow>();
    const layout = pipeline.resolveLabelRowLayout(labelRows, isLabelRow);
    const baseOrder = pipeline.resolveBaseOrder(labelRows.length, layout);
    const { order } = pipeline.resolveOrder({
      rows: labelRows,
      labelLayout: layout,
      visibleColumns: labelColumns,
      columnFilters: {},
      globalFilteredOrder: baseOrder,
      sort: [{ columnKey: 'name', direction: 'asc' }],
      rowDragAvailable: false,
    });
    const inputs = {
      rows: labelRows,
      order,
      rowGroupingActive: false,
      labelLayout: layout,
      labelSortMode: 'section' as const,
      keepEmptySections: false,
      sortActive: true,
      getLabel,
      groupColumns: [],
      aggColumns: [],
      collapsedGroupKeys: new Set<string>(),
      rowKeyGetter: keyGetter,
    };
    const first = pipeline.resolveClientSideRowModel(inputs);
    expect(first.labelDisplay).not.toBeNull();
    const { rowModel } = first;
    expect(rowModel.getRowCount()).toBe(5);
    // [S1] a c [S2] b(セクション内で名前昇順)。
    expect(rowModel.getLabelRow?.(0)).toMatchObject({ kind: 'label', label: 'S1', sectionRowCount: 2 });
    expect(rowModel.getRow(0)).toBeUndefined();
    expect(rowModel.getSourceIndex(0)).toBeUndefined();
    expect(rowModel.getRowKey(0)).toBe(100);
    expect(rowModel.getRow(1)).toBe(labelRows[2]);
    expect(rowModel.getRow(2)).toBe(labelRows[1]);
    expect(rowModel.getLabelRow?.(3)).toMatchObject({ label: 'S2', sectionRowCount: 1 });
    expect(rowModel.getRow(4)).toBe(labelRows[4]);
    const second = pipeline.resolveClientSideRowModel({ ...inputs });
    expect(second.rowModel).toBe(first.rowModel);
    expect(second.labelDisplay).toBe(first.labelDisplay);
  });

  it('rowGroupingActive のときはラベル行 stage をバイパスし、labelLayout なしでは従来経路', () => {
    const pipeline = createRowPipelineResolver<LRow>();
    const layout = pipeline.resolveLabelRowLayout(labelRows, isLabelRow);
    const groupColumns: GridColumn<LRow>[] = [{ key: 'name', title: '名前', width: 120, rowGroup: true }];
    const order = pipeline.resolveBaseOrder(labelRows.length, layout);
    const grouped = pipeline.resolveClientSideRowModel({
      rows: labelRows,
      order,
      rowGroupingActive: true,
      labelLayout: layout,
      getLabel,
      groupColumns,
      aggColumns: [],
      collapsedGroupKeys: new Set<string>(),
      rowKeyGetter: keyGetter,
    });
    expect(grouped.labelDisplay).toBeNull();
    expect(grouped.groupedDisplay).not.toBeNull();
    expect(grouped.rowModel.getLabelRow).toBeUndefined();
    const plain = pipeline.resolveClientSideRowModel({
      rows: labelRows,
      order: pipeline.resolveBaseOrder(labelRows.length),
      rowGroupingActive: false,
      groupColumns: [],
      aggColumns: [],
      collapsedGroupKeys: new Set<string>(),
      rowKeyGetter: keyGetter,
    });
    expect(plain.labelDisplay).toBeNull();
    expect(plain.rowModel.getLabelRow).toBeUndefined();
    expect(plain.rowModel.getRowCount()).toBe(5);
  });
});
