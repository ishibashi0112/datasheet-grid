// 追加(本体分解 E-7): グリッドエンジン束ねの単体テストです(初期 store 状態 = 初回 visibleColumns / 同じ入力で
//   resolveColumns がメモ命中 / serverSide query の seed / dispose で各コントローラの後始末)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGridEngine } from './createGridEngine';
import { createFindController } from '../controllers/findController';
import { createTotalRowCellsResolver } from '../logic/totalRow';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { id: number; name: string };
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名前', width: 120, visible: false },
];
const renderDetailToggleCell = () => null;
const columnInputs = {
  columns,
  isServerSide: false,
  enableRowDrag: false,
  hasRowsChange: false,
  detailToggleColumnActive: false,
  renderDetailToggleCell,
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createGridEngine', () => {
  it('初期 store 状態の列幅は空で、同じ入力の resolveColumns は同じ参照を返す', () => {
    const engine = createGridEngine<Row>({
      features: {},
      columnInputs,
      serverSide: { isServerSide: false, enableGlobalFilter: true, enableColumnFilter: true, enableSorting: true },
    });
    const first = engine.resolveColumns(columnInputs);
    expect(first.visibleColumns.map((column) => column.key)).toEqual(['id']);
    expect(engine.resolveColumns({ ...columnInputs }).visibleColumns).toBe(first.visibleColumns);
    // 初期 columnWidths は空(手動リサイズ / autosize / applyState した列だけを持つ。監査 RD-5 / M-03)。
    expect(engine.store.getState().columnWidths).toEqual({});
    expect(engine.gridApi.handle).toBe(engine.gridApi.handle);
    engine.dispose();
  });

  it('serverSide query の seed は初期 uiState から作られ、debounce ストアの初期値と一致する', () => {
    const engine = createGridEngine<Row>({
      features: {},
      columnInputs: { ...columnInputs, isServerSide: true },
      serverSide: { isServerSide: true, enableGlobalFilter: true, enableColumnFilter: true, enableSorting: true },
    });
    const state = engine.store.getState();
    const live = engine.rowPipeline.resolveServerSideQuery({
      isServerSide: true,
      globalFilterEnabled: true,
      globalText: state.filters.globalText,
      columnFilterEnabled: true,
      columnFilters: state.filters.columnFilters,
      sortingEnabled: true,
      sort: state.sort,
    });
    expect(engine.serverSideQueryStore.getSnapshot()).toBe(live);
    // 同じ live 値で update してもタイマーは張られるが値は不変(seed 一致の効果)。
    engine.serverSideQueryStore.update({ value: live, enabled: true });
    vi.advanceTimersByTime(300);
    expect(engine.serverSideQueryStore.getSnapshot()).toBe(live);
    engine.dispose();
  });

  it('dispose は auto-height 測定 / スクロール計測 / debounce ストアの後始末を行う', () => {
    const engine = createGridEngine<Row>({
      features: {},
      columnInputs,
      serverSide: { isServerSide: false, enableGlobalFilter: true, enableColumnFilter: true, enableSorting: true },
    });
    const next = engine.rowPipeline.resolveServerSideQuery({
      isServerSide: true,
      globalFilterEnabled: true,
      globalText: 'x',
      columnFilterEnabled: true,
      columnFilters: {},
      sortingEnabled: true,
      sort: [],
    });
    engine.serverSideQueryStore.update({ value: next, enabled: true });
    engine.dispose();
    vi.advanceTimersByTime(300);
    expect(engine.serverSideQueryStore.getSnapshot()).not.toBe(next);
  });

  // 追加(差し込み式 段階 2): 機能セットにある機能だけ本物のコントローラを作り、無い機能は何もしない代役にする。
  it('features.find があれば検索のコントローラを作り、無ければ閉じたままの代役にする', () => {
    const serverSide = { isServerSide: false, enableGlobalFilter: true, enableColumnFilter: true, enableSorting: true };
    const findArgs = {
      enabled: true,
      rowModel: { getRowCount: () => 0, getRow: () => undefined } as never,
      columns,
      caseSensitive: false,
      onNavigate: () => {},
    };
    const withFind = createGridEngine<Row>({ features: { find: { createFindController } }, columnInputs, serverSide });
    withFind.find.update(findArgs);
    withFind.find.open('a');
    expect(withFind.find.getSnapshot().open).toBe(true);
    withFind.dispose();

    const withoutFind = createGridEngine<Row>({ features: {}, columnInputs, serverSide });
    withoutFind.find.update(findArgs);
    withoutFind.find.open('a');
    expect(withoutFind.find.getSnapshot()).toMatchObject({ open: false, query: '', matches: [], currentIndex: null });
    expect(withoutFind.find.getSnapshot()).toBe(withoutFind.find.getSnapshot());
    withoutFind.dispose();
  });

  it('機能セットに totalRow があれば合計行を集計し、無ければ代役(常に空)', () => {
    const serverSide = { isServerSide: false, enableGlobalFilter: false, enableColumnFilter: false, enableSorting: false };
    type Sales = { id: number; qty: number };
    const inputs = {
      rows: [
        { id: 1, qty: 2 },
        { id: 2, qty: 3 },
      ] as Sales[],
      order: null,
      columns: [{ key: 'qty', title: '数量', width: 80, aggFunc: 'sum' }] as GridColumn<Sales>[],
      values: { qty: 5 },
    };
    const salesColumnInputs = { ...columnInputs, columns: inputs.columns } as never;
    const withTotal = createGridEngine<Sales>({
      features: { totalRow: { createTotalRowCellsResolver } },
      columnInputs: salesColumnInputs,
      serverSide,
    });
    expect(withTotal.resolveTotalRowCells(inputs).get('qty')?.value).toBe(5);
    withTotal.dispose();

    const withoutTotal = createGridEngine<Sales>({ features: {}, columnInputs: salesColumnInputs, serverSide });
    expect(withoutTotal.resolveTotalRowCells(inputs).size).toBe(0);
    withoutTotal.dispose();
  });
});