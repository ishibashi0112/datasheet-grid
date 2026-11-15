// 追加(1.0.2 / レビュー QA-1): 列フィルターの日付欄に打ちかけのまま Escape で閉じても、その日付を確定しない(Escape は取り消し)。
//   RV-K2 で閉じるときにフォーカスをその場でグリッドへ戻すようにしたところ、日付欄の blur(打った文字を確定する)が
//   ポップオーバーが外れる前に走り、絞り込みが掛かっていました。入力欄にフォーカスがあるときは、ポップオーバーが外れてから戻します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
});

type Row = { id: number; d: string };

const rows: Row[] = [
  { id: 1, d: '2026-06-30' },
  { id: 2, d: '2026-07-01' },
  { id: 3, d: '2026-07-02' },
];

const openFilter = (container: HTMLElement, key: string) => {
  const button = container.querySelector<HTMLButtonElement>(
    `.ssg-header-row [data-ssg-col-key="${key}"] [data-ssg-tooltip="列メニュー"]`,
  );
  expect(button).not.toBeNull();
  act(() => {
    fireEvent.pointerDown(button!, { button: 0 });
    fireEvent.click(button!);
  });
  const filterItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find((item) =>
    item.textContent?.includes('フィルター…'),
  );
  expect(filterItem).toBeDefined();
  act(() => {
    fireEvent.click(filterItem!);
  });
};

describe('列フィルター(dateSet)の日付欄で Escape', () => {
  it('打ちかけの日付を確定せずに閉じ、フォーカスはグリッドへ戻る', async () => {
    const columns: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'd', title: '日付', width: 160, filterType: 'dateSet' },
    ];
    const onFiltersChange = vi.fn();
    const view = render(<SpreadsheetGrid columns={columns} rows={rows} onFiltersChange={onFiltersChange} />);
    openFilter(view.container, 'd');
    const popover = document.querySelector<HTMLElement>('.ssg-filter-popover');
    expect(popover).not.toBeNull();
    const select = popover!.querySelector<HTMLSelectElement>('select');
    expect(select).not.toBeNull();
    act(() => {
      fireEvent.change(select!, { target: { value: 'onOrAfter' } });
    });
    const input = document.querySelector<HTMLInputElement>('.ssg-filter-popover .ssg-dp-input');
    expect(input).not.toBeNull();
    act(() => {
      input!.focus();
      fireEvent.change(input!, { target: { value: '2026/7/1' } });
    });
    onFiltersChange.mockClear();
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Escape' });
      await Promise.resolve();
    });
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('.ssg-body-row').length).toBeGreaterThanOrEqual(3);
    // フォーカスはその場で(次のフレームを待たずに)グリッドへ。
    expect(document.activeElement?.classList.contains('ssg-shell')).toBe(true);
  });
});