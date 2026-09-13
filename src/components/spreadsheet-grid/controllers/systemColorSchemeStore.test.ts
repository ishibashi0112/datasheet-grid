// 追加(非依存化 ③-2): systemColorSchemeStore(prefers-color-scheme の外部 store)のテストです(React 非依存)。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemColorSchemeStore } from './systemColorSchemeStore';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('systemColorSchemeStore', () => {
  it('getSnapshot は matchMedia の一致状態を返し、change で購読者へ通知する', () => {
    const media = stubMatchMedia(false);
    expect(systemColorSchemeStore.getSnapshot()).toBe(false);
    const onChange = vi.fn();
    const unsubscribe = systemColorSchemeStore.subscribe(onChange);
    expect(media.listenerCount()).toBe(1);
    media.emit(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(systemColorSchemeStore.getSnapshot()).toBe(true);
    unsubscribe();
    expect(media.listenerCount()).toBe(0);
  });

  it('matchMedia 非対応環境(jsdom 素)では常に light(false)で購読は no-op', () => {
    expect(typeof window.matchMedia).toBe('undefined');
    expect(systemColorSchemeStore.getSnapshot()).toBe(false);
    const unsubscribe = systemColorSchemeStore.subscribe(() => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('getServerSnapshot は light(false)固定', () => {
    expect(systemColorSchemeStore.getServerSnapshot()).toBe(false);
  });
});