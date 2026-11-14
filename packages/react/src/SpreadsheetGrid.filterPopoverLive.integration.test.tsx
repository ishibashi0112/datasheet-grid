// 追加(1.0.2 / 2026-11-09 実アプリの総点検 B-08 / C-09): 列フィルターのポップオーバーを開いている間の振る舞い。
//   - B-08: rows がよく変わる表でも、開いている間は候補の一覧を開いたときのまま固定する(並びが動いて違う値を外していた)。
//     閉じて開き直すと今の rows の候補。
//   - C-09: 開いたまま別の列の ⋮ を押すと、フィルターを閉じて列メニューだけを開く(2 つ重なっていた)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
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

type Row = { id: number; code: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'code', title: 'コード', width: 120, filterType: 'set' },
  { key: 'qty', title: '数量', width: 100, filterType: 'number' },
];

const menuButtonOf = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLButtonElement>(`.ssg-header-row [data-ssg-col-key="${key}"] [data-ssg-tooltip="列メニュー"]`);

const openFilter = (container: HTMLElement, key: string) => {
  const button = menuButtonOf(container, key);
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

const optionLabels = () =>
  Array.from(document.querySelectorAll('.ssg-filter-popover .ssg-filter-option-label')).map((element) => element.textContent);

describe('列フィルターのポップオーバーを開いている間', () => {
  it('B-08: rows が変わっても候補の一覧は開いたときのまま。開き直すと今の rows の候補', () => {
    const first: Row[] = [
      { id: 1, code: 'A', qty: 1 },
      { id: 2, code: 'B', qty: 2 },
    ];
    const next: Row[] = [
      { id: 1, code: 'A', qty: 1 },
      { id: 2, code: 'C', qty: 2 },
      { id: 3, code: 'D', qty: 3 },
    ];
    const view = (rows: Row[]) => <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />;
    const { container, rerender } = render(view(first));
    openFilter(container, 'code');
    expect(optionLabels()).toEqual(['A', 'B']);
    rerender(view(next));
    expect(optionLabels()).toEqual(['A', 'B']);
    act(() => {
      fireEvent.pointerDown(document.body, { button: 0 });
    });
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    openFilter(container, 'code');
    expect(optionLabels()).toEqual(['A', 'C', 'D']);
  });

  it('C-09: 別の列の ⋮ を押すと、フィルターを閉じて列メニューだけを開く', () => {
    const rows: Row[] = [{ id: 1, code: 'A', qty: 1 }];
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />);
    openFilter(container, 'code');
    expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
    const other = menuButtonOf(container, 'qty');
    act(() => {
      fireEvent.pointerDown(other!, { button: 0 });
      fireEvent.click(other!);
    });
    expect(document.querySelector('.ssg-filter-popover')).toBeNull();
    expect(document.querySelector('.ssg-menu-panel')).not.toBeNull();
  });
});