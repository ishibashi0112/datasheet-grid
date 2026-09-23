// 追加(manual-mode): manualFiltering / manualSorting の結合テストです。フィルター / ソートの状態は
//   従来どおり reducer に載り onStateChange で通知される一方、表示行(= getExportData scope 'view' の順序 /
//   件数)は rows のまま変わらないこと、prop の切り替えで再マウントなしにクライアント処理へ戻ることを検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GRID_STATE_VERSION } from '@ishibashi0112/spreadsheet-grid-core/logic/gridState';
import type {
  GridColumn,
  GridExportData,
  GridState,
  SpreadsheetGridHandle,
} from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100, filterType: 'number' },
];

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 30 },
  { id: 2, name: 'beta', qty: 10 },
  { id: 3, name: 'abbey', qty: 20 },
  { id: 4, name: 'gamma', qty: 40 },
  { id: 5, name: 'berry', qty: 5 },
];

// name に 'be' を含む(2, 3, 5)かつ qty >= 10(2, 3)を qty 降順で。global 'a' も載せる(5 以外が一致)。
// クライアント処理の結果は [3, 2](qty 20, 10)。rows 順は [2, 3] なので「並べ替えない」ことを判別できる。
const filteredSortedState: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: {},
  filters: {
    globalText: 'a',
    columnFilters: {
      name: { kind: 'text', value: 'be' },
      qty: { kind: 'number', raw: '>=10', parsed: { mode: 'comparison', operator: '>=', value: 10 } },
    },
  },
  sort: [{ columnKey: 'qty', direction: 'desc' }],
};

const idsOf = (data: GridExportData): unknown[] => data.rows.map((cells) => cells[0].value);

describe('SpreadsheetGrid manualFiltering / manualSorting(結合)', () => {
  it('manualFiltering: 列 / グローバルフィルターの状態は載り通知されるが、表示行は rows 全件のまま(ソートは適用)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onStateChange = vi.fn();
    render(
      <SpreadsheetGrid ref={ref} columns={columns} rows={rows} manualFiltering onStateChange={onStateChange} />,
    );
    act(() => {
      ref.current?.applyState(filteredSortedState);
    });
    const state = ref.current?.getState();
    expect(state?.filters).toEqual(filteredSortedState.filters);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0][0].filters).toEqual(filteredSortedState.filters);
    // 絞り込まれず 5 行すべて、qty 降順(4, 1, 3, 2, 5)。
    expect(idsOf(ref.current!.getExportData({ scope: 'view' }))).toEqual([4, 1, 3, 2, 5]);
  });

  it('manualSorting: ソート状態は載り通知されるが、表示順は rows のまま(フィルターは適用)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onStateChange = vi.fn();
    render(
      <SpreadsheetGrid ref={ref} columns={columns} rows={rows} manualSorting onStateChange={onStateChange} />,
    );
    act(() => {
      ref.current?.applyState(filteredSortedState);
    });
    expect(ref.current?.getState().sort).toEqual(filteredSortedState.sort);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    // global 'a' × name 'be' × qty >= 10 → 2, 3 が rows 順のまま(クライアントソートなら [3, 2])。
    expect(idsOf(ref.current!.getExportData({ scope: 'view' }))).toEqual([2, 3]);
  });

  it('両方 manual: 表示は rows そのもの。prop を false へ戻すと再マウントなしでクライアント処理が適用される', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(
      <SpreadsheetGrid ref={ref} columns={columns} rows={rows} manualFiltering manualSorting />,
    );
    act(() => {
      ref.current?.applyState(filteredSortedState);
    });
    expect(idsOf(ref.current!.getExportData({ scope: 'view' }))).toEqual([1, 2, 3, 4, 5]);

    view.rerender(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
    expect(ref.current?.getState().filters).toEqual(filteredSortedState.filters);
    expect(idsOf(ref.current!.getExportData({ scope: 'view' }))).toEqual([3, 2]);
  });

  it('manualFiltering で rows が 0 件のとき、フィルターが載っていれば noMatchingRowsText を出す', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={[]}
        manualFiltering
        noRowsText="データなし"
        noMatchingRowsText="一致なし"
      />,
    );
    expect(view.container.querySelector('.ssg-empty-state')?.textContent).toBe('データなし');
    act(() => {
      ref.current?.applyState(filteredSortedState);
    });
    expect(view.container.querySelector('.ssg-empty-state')?.textContent).toBe('一致なし');
  });
});

// 追加(change-callbacks): onFiltersChange / onSortChange の配線(applyState → reducer → passive 通知)。
describe('SpreadsheetGrid onFiltersChange / onSortChange(結合)', () => {
  it('初回マウントでは発火せず、applyState でフィルター / ソートがそれぞれ 1 回ずつ通知される(manual でも同じ)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onFiltersChange = vi.fn();
    const onSortChange = vi.fn();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        manualFiltering
        manualSorting
        onFiltersChange={onFiltersChange}
        onSortChange={onSortChange}
      />,
    );
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    act(() => {
      ref.current?.applyState(filteredSortedState);
    });
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenLastCalledWith(filteredSortedState.filters);
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenLastCalledWith(filteredSortedState.sort);
    // 列幅だけの変更(フィルター / ソートは同値)では発火しない。
    act(() => {
      ref.current?.applyState({ ...filteredSortedState, columnWidths: { id: 200 } });
    });
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenCalledTimes(1);
  });
});