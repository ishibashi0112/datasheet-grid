// 追加(段階 2 DU-12): 状態の初期値 initialState です。これまでは最初の描画の後に applyState を呼ぶしかなく、SSRM は
//   まず条件なしで 1 回取りに行き、Next.js では URL から戻した絞り込み / 並べ替えがサーバーの描画に載りませんでした。
//   initialState は最初の 1 回(マウント時)だけ使い、最初の描画・SSRM の最初の取得・getState() に効きます。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  ServerSideDataSource,
  ServerSideGetRowsParams,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3 },
  { id: 2, name: 'beta', qty: 1 },
  { id: 3, name: 'gamma', qty: 2 },
  { id: 4, name: 'delta', qty: 5 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text' },
  { key: 'qty', title: '数量', width: 100, filterType: 'number' },
];

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const initialState: NonNullable<SpreadsheetGridProps<Row>['initialState']> = {
  columnWidths: { name: 220 },
  filters: { columnFilters: { name: { kind: 'text', value: 'l' } } },
  sort: [{ columnKey: 'qty', direction: 'asc' }],
};

// 中央ペインの「名前」の列のセルの並び(表示順)。
const shownNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row'))
    .filter((row) => row.closest('.ssg-center-pane') !== null)
    .sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex))
    .map((row) => row.querySelector('[data-ssg-col-key="name"]')?.textContent ?? '');

describe('initialState(DU-12)', () => {
  it('最初の描画から絞り込み / 並べ替え / 列幅が効き、getState() にも出る。マウント時は通知しない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onStateChange = vi.fn();
    const onFiltersChange = vi.fn();
    const onSortChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={initialState}
        onStateChange={onStateChange}
        onFiltersChange={onFiltersChange}
        onSortChange={onSortChange}
      />,
    );
    // 「l」を含む行(alpha / delta)を数量の昇順に。
    expect(shownNames(container)).toEqual(['alpha', 'delta']);
    const state = ref.current?.getState();
    expect(state?.sort).toEqual([{ columnKey: 'qty', direction: 'asc' }]);
    expect(state?.filters.columnFilters).toEqual({ name: { kind: 'text', value: 'l' } });
    expect(state?.columnWidths).toEqual({ name: 220 });
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('最初の 1 回だけ使う(後から initialState を変えても今の状態は変わらない)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = (state: SpreadsheetGridProps<Row>['initialState']) => (
      <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={300} initialState={state} />
    );
    const { rerender } = render(view(initialState));
    rerender(view({ sort: [{ columnKey: 'name', direction: 'desc' }] }));
    expect(ref.current?.getState().sort).toEqual([{ columnKey: 'qty', direction: 'asc' }]);
  });

  it('今の列定義に無い列は捨て、開発時に知らせる', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={{ sort: [{ columnKey: 'gone', direction: 'asc' }, { columnKey: 'qty', direction: 'desc' }] }}
      />,
    );
    expect(ref.current?.getState().sort).toEqual([{ columnKey: 'qty', direction: 'desc' }]);
    expect(warn.mock.calls.some(([message]) => String(message).includes('initialState') && String(message).includes('gone'))).toBe(
      true,
    );
  });

  it('serverSide: 最初の取得から initialState の絞り込み / 並べ替えを載せる', async () => {
    const calls: ServerSideGetRowsParams[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) => {
        calls.push(params);
        return Promise.resolve({ rows: rows.slice(params.startIndex, params.endIndex), totalRowCount: rows.length });
      },
    };
    render(
      <SpreadsheetGrid<Row>
        rows={[]}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        dataSource={dataSource}
        initialState={initialState}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.query.sort).toEqual([{ columnKey: 'qty', direction: 'asc' }]);
      expect(call.query.columnFilters).toEqual({ name: { kind: 'text', value: 'l' } });
    }
  });
});