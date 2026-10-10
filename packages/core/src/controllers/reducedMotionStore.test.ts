// 追加(motion-0): reducedMotionStore(prefers-reduced-motion の外部 store)のテストです(React 非依存)。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reducedMotionStore } from './reducedMotionStore';

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const queries: string[] = [];
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
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return mediaQueryList;
  });
  return {
    emit(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next });
      }
    },
    listenerCount: () => listeners.size,
    queries,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reducedMotionStore', () => {
  it('getSnapshot は prefers-reduced-motion の一致状態を返し、change で購読者へ通知する', () => {
    const media = stubMatchMedia(false);
    expect(reducedMotionStore.getSnapshot()).toBe(false);
    expect(media.queries).toContain('(prefers-reduced-motion: reduce)');
    const onChange = vi.fn();
    const unsubscribe = reducedMotionStore.subscribe(onChange);
    expect(media.listenerCount()).toBe(1);
    media.emit(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(reducedMotionStore.getSnapshot()).toBe(true);
    unsubscribe();
    expect(media.listenerCount()).toBe(0);
  });

  it('matchMedia 非対応環境(jsdom 素)では常に false で購読は no-op', () => {
    expect(typeof window.matchMedia).toBe('undefined');
    expect(reducedMotionStore.getSnapshot()).toBe(false);
    const unsubscribe = reducedMotionStore.subscribe(() => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('getServerSnapshot は false 固定', () => {
    expect(reducedMotionStore.getServerSnapshot()).toBe(false);
  });
});
