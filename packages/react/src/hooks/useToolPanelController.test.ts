// 追加(非依存化 ③-15): useToolPanelController の特性テストです(抽出前に現状の挙動を固定)。
//   タブの可用性による解決、open(既開時のフラッシュ)/ close、移動(ドラッグ位置の clamp と維持)、
//   外側 pointerdown(allied 要素は除外)/ Escape(抑止時は onSuppressedEscape)を検証します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useToolPanelController } from './useToolPanelController';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.body.innerHTML = '';
});

type Flags = { filter?: boolean; columns?: boolean; sort?: boolean; suppressEscape?: boolean };

const setup = (flags: Flags = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    top: 100, left: 100, right: 900, bottom: 600, width: 800, height: 500, x: 100, y: 100, toJSON: () => ({}),
  } as DOMRect);
  const allied = document.createElement('div');
  document.body.appendChild(allied);
  const onSuppressedEscape = vi.fn();
  const view = renderHook(
    (p: Flags) =>
      useToolPanelController({
        canUseFilterTab: p.filter ?? true,
        canUseColumnsTab: p.columns ?? true,
        canUseSortTab: p.sort ?? true,
        gridRootRef: { current: root },
        alliedRef: { current: allied },
        suppressEscape: p.suppressEscape ?? false,
        onSuppressedEscape,
      }),
    { initialProps: flags },
  );
  return { ...view, root, allied, onSuppressedEscape };
};

describe('useToolPanelController(特性テスト)', () => {
  it('open で root の右上へ配置、既開時の open はフラッシュ tick を増やす。close で消える', () => {
    const t = setup();
    expect(t.result.current.availableToolPanelTabs).toEqual(['filter', 'columns', 'sort']);
    expect(t.result.current.activeToolPanelTab).toBeNull();
    act(() => {
      t.result.current.openToolPanel('columns');
    });
    expect(t.result.current.activeToolPanelTab).toBe('columns');
    // right(900) - 360 - 12 = 528, top 100 + 12 = 112
    expect(t.result.current.toolPanelLayout).toEqual({ top: 112, left: 528, width: 360 });
    expect(t.result.current.toolPanelFlashTick).toBe(0);
    act(() => {
      t.result.current.openToolPanel('sort');
    });
    expect(t.result.current.activeToolPanelTab).toBe('sort');
    expect(t.result.current.toolPanelFlashTick).toBe(1);
    act(() => {
      t.result.current.closeToolPanel();
    });
    expect(t.result.current.activeToolPanelTab).toBeNull();
    expect(t.result.current.toolPanelLayout).toBeNull();
  });

  it('使えないタブは開けず、可用性が変わると先頭の可用タブへフォールバック / 無ければ閉じる', () => {
    const t = setup({ filter: false });
    act(() => {
      t.result.current.openToolPanel('filter');
    });
    expect(t.result.current.activeToolPanelTab).toBeNull();
    act(() => {
      t.result.current.openToolPanel('sort');
    });
    expect(t.result.current.activeToolPanelTab).toBe('sort');
    t.rerender({ filter: false, sort: false });
    expect(t.result.current.activeToolPanelTab).toBe('columns');
    t.rerender({ filter: false, sort: false, columns: false });
    expect(t.result.current.activeToolPanelTab).toBeNull();
  });

  it('移動は clamp して保持、外側 pointerdown で閉じる(allied / パネル内は除外)、Escape は抑止設定に従う', () => {
    const t = setup();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    act(() => {
      t.result.current.openToolPanel('filter');
    });
    t.result.current.toolPanelRef.current = panel;
    act(() => {
      t.result.current.moveToolPanel(-100, 50);
    });
    expect(t.result.current.toolPanelLayout).toMatchObject({ width: 360 });
    expect(t.result.current.toolPanelLayout?.top).toBeGreaterThanOrEqual(0);
    const moved = t.result.current.toolPanelLayout;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    // ドラッグ位置は resize 後も保持(root 基準へ戻らない)。
    expect(t.result.current.toolPanelLayout).toEqual(moved);

    act(() => {
      panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      t.allied.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.activeToolPanelTab).toBe('filter');
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(t.result.current.activeToolPanelTab).toBeNull();

    const s = setup({ suppressEscape: true });
    act(() => {
      s.result.current.openToolPanel('filter');
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(s.result.current.activeToolPanelTab).toBe('filter');
    expect(s.onSuppressedEscape).toHaveBeenCalledTimes(1);
    s.rerender({ suppressEscape: false });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(s.result.current.activeToolPanelTab).toBeNull();
  });
});