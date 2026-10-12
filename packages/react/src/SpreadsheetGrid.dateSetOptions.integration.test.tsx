// 追加(監査 L-06): Date 値の dateSet 列の候補が年月日ツリーに出て、選ぶと一致する行に絞り込めることの結合テストです。
//   候補は照合と同じ正規化日付キー(toDateSetKey)で集めます(従来は String(Date) の候補になり選べなかった)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  // jsdom は要素寸法が常に 0 で列仮想化が 1 列も描画しないため、寸法を広い固定値でスタブします。
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 900,
  });
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; d: Date };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'd', title: '日付', width: 160, filterType: 'dateSet' },
];

const rows: Row[] = [
  { id: 1, d: new Date(2026, 6, 1) },
  { id: 2, d: new Date(2026, 6, 2) },
  { id: 3, d: new Date(2026, 6, 1, 15, 30) },
];

describe('SpreadsheetGrid dateSet 列(Date 値)の候補', () => {
  it('候補は日付キーで集まり、選んだ日の行に絞り込める', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
    const dateMenuButton = view.container.querySelector<HTMLButtonElement>(
      '.ssg-header-row [data-ssg-col-key="d"] [data-ssg-tooltip="列メニュー"]',
    );
    expect(dateMenuButton).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(dateMenuButton!, { button: 0 });
      fireEvent.click(dateMenuButton!);
    });
    const filterItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find(
      (item) => item.textContent?.includes('フィルター…'),
    );
    expect(filterItem).toBeDefined();
    act(() => {
      fireEvent.click(filterItem!);
    });
    const popover = document.querySelector<HTMLElement>('.ssg-filter-popover');
    expect(popover).not.toBeNull();
    const text = popover!.textContent ?? '';
    // String(Date)('… GMT …')の候補は出ず、年のノードが出る。
    expect(text).not.toContain('GMT');
    expect(text).toContain('2026');
    act(() => {
      ref.current?.applyState({
        ...ref.current.getState(),
        filters: {
          globalText: '',
          columnFilters: { d: { kind: 'dateSet', condition: null, set: { values: ['2026-07-01'] } } },
        },
      });
    });
    const ids = ref.current!.getExportData({ scope: 'view' }).rows.map((cells) => cells[0].value);
    expect(ids).toEqual([1, 3]);
  });
});