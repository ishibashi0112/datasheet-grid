// 追加(非依存化 ③-16): useFilterPopoverController の特性テストです(抽出前に現状の挙動を固定)。
//   open(アンカー解決・filterType 'auto' の解決・ドラフト初期化)、ドラフト更新、resize での再配置、
//   外側 pointerdown / keep-open 要素、close 後の rAF フォーカス復帰、無効時の no-op を検証します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useFilterPopoverController } from './useFilterPopoverController';
import { FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE } from '@ishibashi0112/spreadsheet-grid-core/logic/filterPopoverOutsideClick';
import type { ColumnFilterValue, GridColumn } from '../model/gridTypes';

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.body.innerHTML = '';
});
const flushRaf = () => {
  // 二重 rAF(フォーカス)も進めるため 2 周回します。
  for (let i = 0; i < 2; i += 1) {
    const pending = rafCallbacks.splice(0);
    for (const cb of pending) cb(0);
  }
};

type Row = { name: string; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80, filterType: 'auto' },
  { key: 'tag', title: 'タグ', width: 80, filterType: 'set' },
];

const setup = (opts: { enable?: boolean; values?: Record<string, ColumnFilterValue> } = {}) => {
  const root = document.createElement('div');
  root.tabIndex = 0;
  for (const column of columns) {
    const cell = document.createElement('div');
    cell.dataset.ssgColKey = column.key;
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
      top: 40, bottom: 70, left: 100, right: 220, width: 120, height: 30, x: 100, y: 40, toJSON: () => ({}),
    } as DOMRect);
    root.appendChild(cell);
  }
  document.body.appendChild(root);
  const resolveColumnFilterType = vi.fn(() => 'number' as const);
  const view = renderHook(() =>
    useFilterPopoverController<Row>({
      visibleColumns: columns,
      columnFilterValues: opts.values ?? {},
      enableColumnFilter: opts.enable ?? true,
      gridRootRef: { current: root },
      resolveColumnFilterType,
    }),
  );
  return { ...view, root, resolveColumnFilterType };
};

describe('useFilterPopoverController(特性テスト)', () => {
  it("open でアンカー基準の配置と 'auto' の解決、既存フィルター値からドラフト初期化。無効時は開かない", () => {
    const t = setup({ values: { name: { kind: 'text', value: 'abc' } } });
    act(() => {
      t.result.current.openColumnFilterPopover(columns[0]);
    });
    expect(t.result.current.isFilterPopoverOpen).toBe(true);
    expect(t.result.current.filterPopoverState).toMatchObject({ columnKey: 'name', filterType: 'text', draftValue: 'abc' });
    expect(t.result.current.filterPopoverLayout).toMatchObject({ width: 240 });
    expect(t.result.current.filterPopoverLayout?.top).toBe(78);
    expect(t.result.current.openedFilterColumn?.key).toBe('name');

    act(() => {
      t.result.current.openColumnFilterPopover(columns[1]);
    });
    expect(t.resolveColumnFilterType).toHaveBeenCalledTimes(1);
    expect(t.result.current.openedFilterType).toBe('number');
    expect(t.result.current.openedFilterColumn?.filterType).toBe('number');
    expect(t.result.current.filterPopoverState?.numberDraft).not.toBeNull();

    const disabled = setup({ enable: false });
    act(() => {
      disabled.result.current.openColumnFilterPopover(columns[0]);
    });
    expect(disabled.result.current.isFilterPopoverOpen).toBe(false);
  });

  it('ドラフト更新は開いている間だけ反映され、close で消えて rAF で root へフォーカスが戻る', () => {
    const t = setup();
    act(() => {
      t.result.current.updateFilterPopoverDraft('x');
    });
    expect(t.result.current.filterPopoverState).toBeNull();
    act(() => {
      t.result.current.openColumnFilterPopover(columns[0]);
    });
    act(() => {
      t.result.current.updateFilterPopoverDraft('hello');
    });
    expect(t.result.current.filterPopoverState?.draftValue).toBe('hello');
    act(() => {
      t.result.current.closeColumnFilterPopover();
    });
    expect(t.result.current.isFilterPopoverOpen).toBe(false);
    expect(t.result.current.filterPopoverLayout).toBeNull();
    act(() => {
      flushRaf();
    });
    expect(document.activeElement).toBe(t.root);
  });

  it('外側 pointerdown で閉じる(パネル内 / keep-open 要素は除外)。resize では再配置して開いたまま', () => {
    const t = setup();
    const panel = document.createElement('div');
    const keepOpen = document.createElement('div');
    keepOpen.setAttribute(FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE, '');
    document.body.append(panel, keepOpen);
    act(() => {
      t.result.current.openColumnFilterPopover(columns[0]);
    });
    t.result.current.filterPopoverRef.current = panel;
    act(() => {
      panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      keepOpen.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      window.dispatchEvent(new Event('resize'));
    });
    expect(t.result.current.isFilterPopoverOpen).toBe(true);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.isFilterPopoverOpen).toBe(false);
  });
});