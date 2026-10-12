// 追加(非依存化 ③-16): filterPopoverController のテストです(React 非依存で直接呼ぶ)。
//   hooks/useFilterPopoverController.test.ts(特性テスト 3 件)と対になり、こちらは開いている列の解決
//   (純関数)、update 前の no-op、二重 rAF での入力欄フォーカス、dispose を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFilterPopoverController,
  resolveOpenedFilterColumn,
} from './filterPopoverController';
import type { GridColumn } from '../model/gridTypes.unbound';

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
  document.body.innerHTML = '';
});
const flushRaf = () => {
  for (let i = 0; i < 2; i += 1) {
    const pending = rafCallbacks.splice(0);
    for (const cb of pending) cb(0);
  }
};

const columns: GridColumn<unknown>[] = [
  { key: 'name', title: '名前', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80, filterType: 'auto' },
];

describe('resolveOpenedFilterColumn', () => {
  it('閉じているときは null、開いた種別が列定義と違えば filterType を上書きした列を返す', () => {
    expect(resolveOpenedFilterColumn(columns, null)).toBeNull();
    const state = { columnKey: 'qty', filterType: 'number' as const, draftValue: '', numberDraft: null, textDraft: null, dateDraft: null };
    expect(resolveOpenedFilterColumn(columns, state)).toMatchObject({ key: 'qty', filterType: 'number' });
    expect(resolveOpenedFilterColumn(columns, { ...state, columnKey: 'name', filterType: 'text' })).toBe(columns[0]);
    expect(resolveOpenedFilterColumn(columns, { ...state, columnKey: 'missing' })).toBeNull();
  });
});

describe('createFilterPopoverController', () => {
  it('update 前は開けない。開いて配置が決まると二重 rAF でテキスト入力の末尾へフォーカスし、dispose で後始末する', () => {
    const c = createFilterPopoverController<unknown>();
    c.open(columns[0]);
    expect(c.getSnapshot().state).toBeNull();

    const root = document.createElement('div');
    const cell = document.createElement('div');
    cell.dataset.ssgColKey = 'name';
    root.appendChild(cell);
    document.body.appendChild(root);
    const args = {
      visibleColumns: columns,
      columnFilterValues: {},
      enableColumnFilter: true,
      gridRootRef: { current: root },
    };
    c.update(args);
    c.open(columns[0]);
    expect(c.getSnapshot().state?.columnKey).toBe('name');
    expect(c.getSnapshot().layout).toMatchObject({ width: 240 });

    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'abc';
    document.body.appendChild(input);
    c.textInputRef.current = input;
    // レンダー後の update でフォーカスを予約 → 二重 rAF 後に末尾へ。
    c.update(args);
    expect(document.activeElement).not.toBe(input);
    flushRaf();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);

    c.updateDraft('zzz');
    expect(c.getSnapshot().state?.draftValue).toBe('zzz');
    c.dispose();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.getSnapshot().state?.columnKey).toBe('name');
  });

  // 追加(audit C-4): 開いたまま横スクロールでアンカーのヘッダーセルが外れても、左上へ飛ばない。
  it('アンカーが DOM から外れたら同じ列のセルを探し直し、無ければ直前の位置のまま', () => {
    const c = createFilterPopoverController<unknown>();
    const root = document.createElement('div');
    const makeCell = (rect: { top: number; left: number; width: number; height: number }) => {
      const cell = document.createElement('div');
      cell.dataset.ssgColKey = 'name';
      cell.getBoundingClientRect = () =>
        (cell.isConnected
          ? { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top }
          : { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 }) as DOMRect;
      return cell;
    };
    const first = makeCell({ top: 100, left: 300, width: 120, height: 32 });
    root.appendChild(first);
    document.body.appendChild(root);
    c.update({ visibleColumns: columns, columnFilterValues: {}, enableColumnFilter: true, gridRootRef: { current: root } });
    c.open(columns[0]);
    const opened = c.getSnapshot().layout;
    expect(opened).not.toBeNull();
    expect(opened?.top).toBeGreaterThan(100);

    // 横の仮想化でセルが外れる → scroll で再配置しても位置を保つ(閉じない)。
    first.remove();
    window.dispatchEvent(new Event('scroll'));
    expect(c.getSnapshot().layout).toEqual(opened);
    expect(c.getSnapshot().state?.columnKey).toBe('name');

    // 同じ列のセルが別の位置で描かれ直したら、そちらへ付いていく。
    const second = makeCell({ top: 100, left: 500, width: 120, height: 32 });
    root.appendChild(second);
    window.dispatchEvent(new Event('scroll'));
    const moved = c.getSnapshot().layout;
    expect(moved?.top).toBe(opened?.top);
    expect(moved?.left).not.toBe(opened?.left);
    c.dispose();
  });
});