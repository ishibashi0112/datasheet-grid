// 追加(async-options): getFilterOptions の結合テストです。チップバーの「編集」で列フィルター popover を開くと
//   コールバックが「自列を除いた他列フィルター」付きで呼ばれ、閉じると signal が abort されること、静的
//   filterOptions 指定列では呼ばれないことを、実コンポーネントを通して検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GRID_STATE_VERSION } from '@ishibashi0112/spreadsheet-grid-core/logic/gridState';
import type {
  GetFilterOptionsParams,
  GridColumn,
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
  // jsdom は寸法 0 のため列が 1 本も配置されず(ヘッダーセルが無く popover のアンカーが取れない)、
  //   ラベル行の結合テストと同じくレイアウト寸法をスタブします。
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 });
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; category: string; status: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
  { key: 'category', title: 'Category', width: 120, filterType: 'set' },
  {
    key: 'status',
    title: 'Status',
    width: 120,
    filterType: 'set',
    filterOptions: [{ label: 'open', value: 'open' }],
  },
];

const rows: Row[] = [
  { id: 1, name: 'alpha', category: 'a', status: 'open' },
  { id: 2, name: 'beta', category: 'b', status: 'closed' },
];

const state: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: {},
  filters: {
    globalText: 'x',
    columnFilters: {
      name: { kind: 'text', value: 'be' },
      category: { kind: 'set', mode: 'include', values: ['a'] },
      status: { kind: 'set', mode: 'include', values: ['open'] },
    },
  },
  sort: [],
};

type Deferred = {
  params: GetFilterOptionsParams<Row>;
  resolve: (v: { options: { label: string; value: string }[]; truncated?: boolean }) => void;
};

const setup = () => {
  const calls: Deferred[] = [];
  const getFilterOptions = vi.fn(
    (params: GetFilterOptionsParams<Row>) =>
      new Promise<{ options: { label: string; value: string }[]; truncated?: boolean }>((resolve) => {
        calls.push({ params, resolve });
      }),
  );
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  render(
    <SpreadsheetGrid
      ref={ref}
      columns={columns}
      rows={rows}
      showFilterChipBar
      getFilterOptions={getFilterOptions}
    />,
  );
  act(() => {
    ref.current?.applyState(state);
  });
  return { calls, getFilterOptions, ref };
};

describe('SpreadsheetGrid getFilterOptions(結合)', () => {
  it('popover を開くと自列を除いた他列フィルター + globalText で呼ばれ、閉じると abort される', async () => {
    const { calls, getFilterOptions } = setup();
    expect(getFilterOptions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Category のフィルターを編集'));
    await waitFor(() => expect(getFilterOptions).toHaveBeenCalledTimes(1));
    const { params } = calls[0];
    expect(params.columnKey).toBe('category');
    expect(params.column.key).toBe('category');
    expect(params.columnFilters).toEqual({
      name: { kind: 'text', value: 'be' },
      status: { kind: 'set', mode: 'include', values: ['open'] },
    });
    expect(params.globalText).toBe('x');
    expect(screen.getByText('候補を取得中…')).toBeTruthy();

    // 取得完了 → 一覧(打ち切り注記付き)。
    await act(async () => {
      calls[0].resolve({ options: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }], truncated: true });
    });
    expect(screen.getByText('（先頭のみ・打ち切り）')).toBeTruthy();
    expect(screen.getByText(/選択中: 1 \/ 2 件/)).toBeTruthy();

    // Escape で閉じる(完了済みの要求は abort しない = 完了後に中断する意味がない)。
    fireEvent.keyDown(screen.getByPlaceholderText('検索（Enter で確定）'), { key: 'Escape' });
    expect(params.signal.aborted).toBe(false);
    expect(screen.queryByPlaceholderText('検索（Enter で確定）')).toBeNull();
  });

  it('取得中に閉じると signal が abort され、遅れて来た応答は表示されない', async () => {
    const { calls, getFilterOptions } = setup();
    fireEvent.click(screen.getByLabelText('Category のフィルターを編集'));
    await waitFor(() => expect(getFilterOptions).toHaveBeenCalledTimes(1));
    expect(screen.getByText('候補を取得中…')).toBeTruthy();
    // 取得中は検索欄(Escape の受け口)が無いので、外側クリック(document の pointerdown)で閉じる。
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByText('候補を取得中…')).toBeNull());
    expect(calls[0].params.signal.aborted).toBe(true);
    await act(async () => {
      calls[0].resolve({ options: [{ label: 'late', value: 'late' }] });
    });
    expect(screen.queryByText('（先頭のみ・打ち切り）')).toBeNull();
    expect(screen.queryByText(/選択中:/)).toBeNull();
  });

  it('静的 filterOptions 指定列では getFilterOptions を呼ばない(静的候補が優先)', async () => {
    const { getFilterOptions } = setup();
    fireEvent.click(screen.getByLabelText('Status のフィルターを編集'));
    await waitFor(() => expect(screen.getByPlaceholderText('検索（Enter で確定）')).toBeTruthy());
    expect(getFilterOptions).not.toHaveBeenCalled();
  });
});