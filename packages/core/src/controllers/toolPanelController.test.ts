// 追加(非依存化 ③-15): toolPanelController のテストです(React 非依存で直接呼ぶ)。
//   hooks/useToolPanelController.test.ts(特性テスト 3 件)と対になり、こちらはタブ解決の純関数と
//   可用性変化による自動クローズ(リスナーの付け外し)を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToolPanelController,
  resolveActiveToolPanelTab,
  resolveAvailableToolPanelTabs,
  resolveToolPanelVerticalPlacement,
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

describe('画面の中に収める(AP-30)', () => {
  it('既定の位置: 上限が下に入らなければ上へずらし、低い画面では高さの上限を画面に合わせる', () => {
    // 十分な高さ: そのまま、上限は 420px。
    expect(resolveToolPanelVerticalPlacement(100, 900, false)).toEqual({ top: 100, maxHeight: 420 });
    // 下に入らない: 上へずらす(900 - 8 - 420 = 472)。
    expect(resolveToolPanelVerticalPlacement(600, 900, false)).toEqual({ top: 472, maxHeight: 420 });
    // スマホの横向き(高さ 390px): 上端は余白、上限は 390 - 16 = 374px。
    expect(resolveToolPanelVerticalPlacement(79, 390, false)).toEqual({ top: 8, maxHeight: 374 });
  });

  it('掴んで動かした位置: 位置はそのままで、下に残る高さを上限にする', () => {
    expect(resolveToolPanelVerticalPlacement(500, 900, true)).toEqual({ top: 500, maxHeight: 392 });
    expect(resolveToolPanelVerticalPlacement(20, 900, true)).toEqual({ top: 20, maxHeight: 420 });
  });

  // 1.0.1 のレビュー RB-5: 下へ動かすと本体の最小の高さ(240px)が枠の外へはみ出していた。
  it('掴んで動かした位置でも、最小の高さ(336px)が入らない位置へは下げない', () => {
    // 高さ 900 で上端 700: 900 - 8 - 336 = 556 まで上げる。
    expect(resolveToolPanelVerticalPlacement(700, 900, true)).toEqual({ top: 556, maxHeight: 336 });
    // スマホの横向き(高さ 390px): 390 - 8 - 336 = 46。
    expect(resolveToolPanelVerticalPlacement(300, 390, true)).toEqual({ top: 46, maxHeight: 336 });
    // 画面がもっと低いときは、上限(画面の高さ - 余白 2 つ)まで。
    expect(resolveToolPanelVerticalPlacement(200, 300, true)).toEqual({ top: 8, maxHeight: 284 });
  });

  it('開いたときの layout に maxHeight が入る', () => {
    vi.stubGlobal('innerHeight', 390);
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.getBoundingClientRect = () => ({ top: 67, left: 0, right: 664, bottom: 380, width: 664, height: 313, x: 0, y: 67, toJSON: () => ({}) });
    const c = createToolPanelController();
    c.update({ canUseFilterTab: true, canUseColumnsTab: true, canUseSortTab: true, gridRootRef: { current: root } });
    c.open('columns');
    expect(c.getSnapshot().layout).toMatchObject({ top: 8, maxHeight: 374 });
    c.move(30, 100);
    expect(c.getSnapshot().layout).toMatchObject({ top: 30, maxHeight: 352 });
    // 最小の高さが入らない位置へは下げない(RB-5)。
    c.move(200, 100);
    expect(c.getSnapshot().layout).toMatchObject({ top: 46, maxHeight: 336 });
    c.dispose();
  });
});