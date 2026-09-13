// 追加(本体分解 E-2): debounce ストアの単体テストです(静止後に一度だけ反映 / 連続更新の合体 / enabled=false では
//   反映しない / dispose でタイマー停止)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedValueStore } from './debouncedValueStore';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createDebouncedValueStore', () => {
  it('live 値の変化は delay 静止後に一度だけ snapshot へ反映され、購読者へ通知される', () => {
    const store = createDebouncedValueStore('a', 300);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ value: 'b', enabled: true });
    store.update({ value: 'c', enabled: true });
    vi.advanceTimersByTime(299);
    expect(store.getSnapshot()).toBe('a');
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBe('c');
    expect(listener).toHaveBeenCalledTimes(1);
    // 同じ値の update はタイマーを張り直さない。
    store.update({ value: 'c', enabled: true });
    vi.advanceTimersByTime(300);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('enabled=false では反映せず、dispose で保留中のタイマーを止める', () => {
    const store = createDebouncedValueStore(0, 100);
    store.update({ value: 1, enabled: false });
    vi.advanceTimersByTime(100);
    expect(store.getSnapshot()).toBe(0);
    store.update({ value: 2, enabled: true });
    store.dispose();
    vi.advanceTimersByTime(100);
    expect(store.getSnapshot()).toBe(0);
  });
});