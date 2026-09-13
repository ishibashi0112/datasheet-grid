// 追加(非依存化 ③-16): filterPopoverController のテストです(React 非依存で直接呼ぶ)。
//   hooks/useFilterPopoverController.test.ts(特性テスト 3 件)と対になり、こちらは開いている列の解決
//   (純関数)、update 前の no-op、二重 rAF での入力欄フォーカス、dispose を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFilterPopoverController,
  resolveOpenedFilterColumn,
} from './filterPopoverController';
import type { GridColumn } from '../model/gridTypes';

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
});