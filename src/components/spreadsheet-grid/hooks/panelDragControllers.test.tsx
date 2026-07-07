// 変更(UP-1)の controller テスト: 統合ツールパネル controller(useToolPanelController)の
//   開閉 / タブ / ドラッグ移動の挙動固定です(旧 FM-4: 3 パネル controller のテストを継承)。
//   - move で layout が即時反映され、範囲外はビューポートへ clamp されること。
//   - ドラッグ後に close → 再 open で既定位置(gridRoot アンカー)へ戻ること(合意 d)。
//   - ドラッグ後の resize はビューポートへ再 clamp すること(gridRoot へは戻らない)。
//   - 既に開いているときの open(tab) はタブ切替のみで、位置(layout)が不動なこと。
//   - 不可用タブへの open は no-op なこと / availableToolPanelTabs が可用性と表示順を反映すること。
//   - 表示中にアクティブタブが不可用化されたら先頭の可用タブへ退避すること(派生解決)。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

import { useToolPanelController } from './useToolPanelController';

const makeGridRootRef = (): RefObject<HTMLDivElement | null> => ({
  current: document.createElement('div'),
});

// 既定引数(全タブ可用)です。テストごとに可用性フラグを上書きします。
const makeArgs = (overrides?: {
  canUseFilterTab?: boolean;
  canUseColumnsTab?: boolean;
  canUseSortTab?: boolean;
}) => ({
  canUseFilterTab: overrides?.canUseFilterTab ?? true,
  canUseColumnsTab: overrides?.canUseColumnsTab ?? true,
  canUseSortTab: overrides?.canUseSortTab ?? true,
  gridRootRef: makeGridRootRef(),
});

describe('UP-1: 統合ツールパネル(controller の move / clamp / リセット)', () => {
  it('moveToolPanel で layout が移動し、範囲外はビューポートへ clamp される', () => {
    const { result } = renderHook(() => useToolPanelController(makeArgs()));
    act(() => {
      result.current.openToolPanel('filter');
    });
    act(() => {
      result.current.moveToolPanel(200, 300);
    });
    expect(result.current.toolPanelLayout).toEqual({
      top: 200,
      left: 300,
      width: 360,
    });
    // 範囲外(右下遠方)は clamp されます(左右: vw - 幅 - 8 / 上下: vh - 40)。
    act(() => {
      result.current.moveToolPanel(99999, 99999);
    });
    expect(result.current.toolPanelLayout).toEqual({
      top: window.innerHeight - 40,
      left: window.innerWidth - 360 - 8,
      width: 360,
    });
  });

  it('ドラッグ後に close → 再 open すると前回のドラッグ位置へ復元する(UP-2 位置記憶)', () => {
    const { result } = renderHook(() => useToolPanelController(makeArgs()));
    act(() => {
      result.current.openToolPanel('filter');
    });
    const initial = result.current.toolPanelLayout;
    expect(initial).not.toBeNull();
    act(() => {
      result.current.moveToolPanel(200, 300);
    });
    const moved = result.current.toolPanelLayout;
    expect(moved).toEqual({ top: 200, left: 300, width: 360 });
    expect(moved).not.toEqual(initial);
    act(() => {
      result.current.closeToolPanel();
    });
    expect(result.current.activeToolPanelTab).toBeNull();
    // 変更(UP-2): 既定位置ではなく前回のドラッグ位置へ戻ります(in-memory 保持)。
    act(() => {
      result.current.openToolPanel('columns');
    });
    expect(result.current.toolPanelLayout).toEqual(moved);
  });

  it('ドラッグ後の resize はビューポートへ再 clamp する(gridRoot アンカーへは戻らない)', () => {
    const { result } = renderHook(() => useToolPanelController(makeArgs()));
    act(() => {
      result.current.openToolPanel('filter');
    });
    act(() => {
      result.current.moveToolPanel(500, 600);
    });
    expect(result.current.toolPanelLayout).toEqual({
      top: 500,
      left: 600,
      width: 360,
    });
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    try {
      // jsdom の innerWidth / innerHeight を縮めて resize を発火します。
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          value: 500,
          configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', {
          value: 400,
          configurable: true,
        });
        window.dispatchEvent(new Event('resize'));
      });
      expect(result.current.toolPanelLayout).toEqual({
        top: 400 - 40,
        left: 500 - 360 - 8,
        width: 360,
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        value: originalWidth,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: originalHeight,
        configurable: true,
      });
    }
  });
});

describe('UP-1: 統合ツールパネル(タブと可用性)', () => {
  it('既に開いているときの open(tab) はタブ切替のみで layout が不動', () => {
    const { result } = renderHook(() => useToolPanelController(makeArgs()));
    act(() => {
      result.current.openToolPanel('filter');
    });
    act(() => {
      // ドラッグ位置でも既定位置でも「切替で動かない」は同じですが、
      // ドラッグ後の方が回帰に敏感なため移動してから切り替えます。
      result.current.moveToolPanel(150, 250);
    });
    const moved = result.current.toolPanelLayout;
    act(() => {
      result.current.openToolPanel('columns');
    });
    expect(result.current.activeToolPanelTab).toBe('columns');
    expect(result.current.toolPanelLayout).toEqual(moved);
    act(() => {
      result.current.openToolPanel('sort');
    });
    expect(result.current.activeToolPanelTab).toBe('sort');
    expect(result.current.toolPanelLayout).toEqual(moved);
  });

  it('不可用タブへの open は no-op(閉じたまま / 表示タブ不変)', () => {
    const { result } = renderHook(() =>
      useToolPanelController(makeArgs({ canUseSortTab: false })),
    );
    act(() => {
      result.current.openToolPanel('sort');
    });
    expect(result.current.activeToolPanelTab).toBeNull();
    act(() => {
      result.current.openToolPanel('filter');
    });
    act(() => {
      result.current.openToolPanel('sort');
    });
    expect(result.current.activeToolPanelTab).toBe('filter');
  });

  it('availableToolPanelTabs は可用性と表示順(filter → columns → sort)を反映する', () => {
    const all = renderHook(() => useToolPanelController(makeArgs()));
    expect(all.result.current.availableToolPanelTabs).toEqual([
      'filter',
      'columns',
      'sort',
    ]);

    const partial = renderHook(() =>
      useToolPanelController(makeArgs({ canUseFilterTab: false })),
    );
    expect(partial.result.current.availableToolPanelTabs).toEqual([
      'columns',
      'sort',
    ]);
  });

  it('表示中にアクティブタブが不可用化されたら先頭の可用タブへ退避する(派生解決)', () => {
    const { result, rerender } = renderHook(
      ({ canUseSortTab }: { canUseSortTab: boolean }) =>
        useToolPanelController(makeArgs({ canUseSortTab })),
      { initialProps: { canUseSortTab: true } },
    );
    act(() => {
      result.current.openToolPanel('sort');
    });
    expect(result.current.activeToolPanelTab).toBe('sort');
    rerender({ canUseSortTab: false });
    expect(result.current.activeToolPanelTab).toBe('filter');
    // 可用へ戻れば元のタブへ復帰します(requestedTab は保持しているため)。
    rerender({ canUseSortTab: true });
    expect(result.current.activeToolPanelTab).toBe('sort');
  });
});

describe('UP-2: 統合ツールパネル(既開時フラッシュ toolPanelFlashTick)', () => {
  it('閉→開では increment しない / 既に開いているときの open で increment する', () => {
    const { result } = renderHook(() => useToolPanelController(makeArgs()));
    // 初期値は 0。
    expect(result.current.toolPanelFlashTick).toBe(0);
    // 閉→開(1 回目)では増えません。
    act(() => {
      result.current.openToolPanel('filter');
    });
    expect(result.current.toolPanelFlashTick).toBe(0);
    // 既に開いている状態での open(別タブ切替)で increment します。
    act(() => {
      result.current.openToolPanel('columns');
    });
    expect(result.current.toolPanelFlashTick).toBe(1);
    // 同一タブの再 open(導線の再クリック相当)でも increment します。
    act(() => {
      result.current.openToolPanel('columns');
    });
    expect(result.current.toolPanelFlashTick).toBe(2);
    // close を挟むと次の open は「閉→開」なので増えません。
    act(() => {
      result.current.closeToolPanel();
    });
    act(() => {
      result.current.openToolPanel('sort');
    });
    expect(result.current.toolPanelFlashTick).toBe(2);
  });

  it('不可用タブへの open は no-op のため increment しない', () => {
    const { result } = renderHook(() =>
      useToolPanelController(makeArgs({ canUseSortTab: false })),
    );
    act(() => {
      result.current.openToolPanel('filter');
    });
    expect(result.current.toolPanelFlashTick).toBe(0);
    // 開いている状態でも、不可用タブ(sort)への open は弾かれるので増えません。
    act(() => {
      result.current.openToolPanel('sort');
    });
    expect(result.current.toolPanelFlashTick).toBe(0);
    expect(result.current.activeToolPanelTab).toBe('filter');
  });
});