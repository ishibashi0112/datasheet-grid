// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResolvedGridMotion } from './useResolvedGridMotion';

// matchMedia のフェイクです(useResolvedGridTheme.test.ts と同型)。
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

describe('useResolvedGridMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("'on' / 'off' は matchMedia に依らずそのまま返す", () => {
    stubMatchMedia(true);
    const on = renderHook(() => useResolvedGridMotion('on'));
    expect(on.result.current).toBe('on');
    on.unmount();
    const off = renderHook(() => useResolvedGridMotion('off'));
    expect(off.result.current).toBe('off');
    off.unmount();
  });

  it("'auto' は prefers-reduced-motion: reduce が有効なら 'off'", () => {
    stubMatchMedia(true);
    const hook = renderHook(() => useResolvedGridMotion('auto'));
    expect(hook.result.current).toBe('off');
    hook.unmount();
  });

  it("'auto' は設定の変化(change イベント)へ追従する", () => {
    const media = stubMatchMedia(false);
    const hook = renderHook(() => useResolvedGridMotion('auto'));
    expect(hook.result.current).toBe('on');
    act(() => {
      media.emit(true);
    });
    expect(hook.result.current).toBe('off');
    act(() => {
      media.emit(false);
    });
    expect(hook.result.current).toBe('on');
    hook.unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("matchMedia 非対応環境(jsdom 素)では auto は 'on' 扱い", () => {
    const hook = renderHook(() => useResolvedGridMotion('auto'));
    expect(hook.result.current).toBe('on');
    hook.unmount();
  });
});
