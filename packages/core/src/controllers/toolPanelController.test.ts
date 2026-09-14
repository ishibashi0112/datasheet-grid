// 追加(非依存化 ③-15): toolPanelController のテストです(React 非依存で直接呼ぶ)。
//   hooks/useToolPanelController.test.ts(特性テスト 3 件)と対になり、こちらはタブ解決の純関数と
//   可用性変化による自動クローズ(リスナーの付け外し)を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToolPanelController,
  resolveActiveToolPanelTab,
  resolveAvailableToolPanelTabs,
} from './toolPanelController';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('タブ解決', () => {
  it('可用タブは表示順、要求タブが使えなければ先頭へフォールバック、無ければ null', () => {
    expect(resolveAvailableToolPanelTabs({ canUseFilterTab: false, canUseColumnsTab: true, canUseSortTab: true })).toEqual(['columns', 'sort']);
    expect(resolveActiveToolPanelTab('filter', ['columns', 'sort'])).toBe('columns');
    expect(resolveActiveToolPanelTab('sort', ['columns', 'sort'])).toBe('sort');
    expect(resolveActiveToolPanelTab('sort', [])).toBeNull();
    expect(resolveActiveToolPanelTab(null, ['filter'])).toBeNull();
  });
});

describe('createToolPanelController', () => {
  it('update 前は開けない。開いている間だけ外側 pointerdown を受け、可用性が無くなると自動で閉じてリスナーが外れる', () => {
    const c = createToolPanelController();
    c.open('filter');
    expect(c.getSnapshot().requestedTab).toBeNull();

    const root = document.createElement('div');
    document.body.appendChild(root);
    const base = { canUseFilterTab: true, canUseColumnsTab: true, canUseSortTab: true, gridRootRef: { current: root } };
    c.update(base);
    c.open('filter');
    expect(c.getSnapshot().requestedTab).toBe('filter');
    expect(c.getSnapshot().layout).toMatchObject({ width: 360 });

    // 可用タブが無くなる → 実タブ null → リスナーが外れる(requestedTab は残る = 旧挙動)。
    c.update({ ...base, canUseFilterTab: false, canUseColumnsTab: false, canUseSortTab: false });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.getSnapshot().requestedTab).toBe('filter');

    // 可用性が戻る → 再び開いた扱い → 外側 pointerdown で閉じる。
    c.update(base);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.getSnapshot().requestedTab).toBeNull();
    expect(c.getSnapshot().layout).toBeNull();
  });
});