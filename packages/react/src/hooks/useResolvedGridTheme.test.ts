// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResolvedGridTheme } from './useResolvedGridTheme';

// matchMedia のフェイクです(jsdom は matchMedia 未実装のためガード経路 / モック経路の
// 両方を検証できます)。change リスナーを保持し、emit で発火させます。
function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    addEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', () => mediaQueryList);
  return {
    emit(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next });
      }
    },
    listenerCount: () => listeners.size,
  };
}

describe('useResolvedGridTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 変更(段階 2 DU-13): 返すのは実効テーマではなく、root と各ポータルへ付ける修飾子クラス(ライトはなし)。
  it("'light' / 'dark' は matchMedia に依らずそのまま返す", () => {
    stubMatchMedia(true);
    const light = renderHook(() => useResolvedGridTheme('light'));
    expect(light.result.current).toBeUndefined();
    light.unmount();
    const dark = renderHook(() => useResolvedGridTheme('dark'));
    expect(dark.result.current).toBe('ssg-theme-dark');
    dark.unmount();
  });

  it("'auto' は prefers-color-scheme: dark の一致状態を返す", () => {
    stubMatchMedia(true);
    const hook = renderHook(() => useResolvedGridTheme('auto'));
    expect(hook.result.current).toBe('ssg-theme-dark');
    hook.unmount();
  });

  it("'auto' は配色設定の変化(change イベント)へ追従する", () => {
    const media = stubMatchMedia(false);
    const hook = renderHook(() => useResolvedGridTheme('auto'));
    expect(hook.result.current).toBeUndefined();
    act(() => {
      media.emit(true);
    });
    expect(hook.result.current).toBe('ssg-theme-dark');
    act(() => {
      media.emit(false);
    });
    expect(hook.result.current).toBeUndefined();
    hook.unmount();
    // アンマウントで change 購読が解除されます。
    expect(media.listenerCount()).toBe(0);
  });

  it("'class' は配色設定に依らず ssg-theme-class(ダークかどうかは CSS が祖先の .dark で決める)", () => {
    stubMatchMedia(true);
    const hook = renderHook(() => useResolvedGridTheme('class'));
    expect(hook.result.current).toBe('ssg-theme-class');
    hook.unmount();
  });

  it('matchMedia 非対応環境(jsdom 素)では auto は light 扱い', () => {
    // stub しない = jsdom の window.matchMedia は undefined。
    const hook = renderHook(() => useResolvedGridTheme('auto'));
    expect(hook.result.current).toBeUndefined();
    hook.unmount();
  });
});