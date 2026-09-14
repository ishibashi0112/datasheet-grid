// 追加(本体分解 E-7): グリッドエンジン束ねの単体テストです(初期 store 状態 = 初回 visibleColumns / 同じ入力で
//   resolveColumns がメモ命中 / serverSide query の seed / dispose で各コントローラの後始末)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGridEngine } from './createGridEngine';
import type { GridColumn } from '../model/gridTypes';

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
  it('初期 store 状態は初回 visibleColumns から作られ、同じ入力の resolveColumns は同じ参照を返す', () => {
    const engine = createGridEngine<Row>({
      columnInputs,
      serverSide: { isServerSide: false, enableGlobalFilter: true, enableColumnFilter: true, enableSorting: true },
    });
    const first = engine.resolveColumns(columnInputs);
    expect(first.visibleColumns.map((column) => column.key)).toEqual(['id']);
    expect(engine.resolveColumns({ ...columnInputs }).visibleColumns).toBe(first.visibleColumns);
    // 初期 columnWidths は可視列の幅から(従来の createInitialGridUiState と同じ)。
    expect(engine.store.getState().columnWidths).toEqual({ id: 80 });
    expect(engine.gridApi.handle).toBe(engine.gridApi.handle);
    engine.dispose();
  });

  it('serverSide query の seed は初期 uiState から作られ、debounce ストアの初期値と一致する', () => {
    const engine = createGridEngine<Row>({
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
});