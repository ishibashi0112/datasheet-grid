// 監査 L-15: 相対日付プリセットの基準日ストア(日付の変わり目で差し替わる)のテスト。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createDateRolloverStore } from './dateRolloverStore';

describe('createDateRolloverStore(監査 L-15)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 23, 58));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('見張り中は深夜 0 時を過ぎたら基準日を差し替えて通知する', () => {
    const store = createDateRolloverStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ active: true });
    expect(store.getSnapshot()).toBe('2026-10-12');
    vi.advanceTimersByTime(60_000);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(61_000);
    expect(store.getSnapshot()).toBe('2026-10-13');
    expect(listener).toHaveBeenCalledTimes(1);
    // 翌日の深夜 0 時にも追従する(タイマーを張り直している)。
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(store.getSnapshot()).toBe('2026-10-14');
    expect(listener).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('見張っていない間はタイマーを持たず、見張りを始めたときに追いつく', () => {
    const store = createDateRolloverStore();
    store.update({ active: false });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    expect(store.getSnapshot()).toBe('2026-10-12');
    store.update({ active: true });
    expect(store.getSnapshot()).toBe('2026-10-14');
    expect(vi.getTimerCount()).toBe(1);
    store.update({ active: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('タイマーが遅れても(スリープ明け等)タブが前面に戻ったときに確かめ直す', () => {
    let fakeNow = new Date(2026, 9, 12, 23, 58);
    const store = createDateRolloverStore({ now: () => fakeNow });
    store.update({ active: true });
    // タイマーは発火しないまま時計だけ進んだ(スリープ中)。
    fakeNow = new Date(2026, 9, 13, 8, 0);
    expect(store.getSnapshot()).toBe('2026-10-12');
    window.dispatchEvent(new Event('focus'));
    expect(store.getSnapshot()).toBe('2026-10-13');
    fakeNow = new Date(2026, 9, 14, 8, 0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getSnapshot()).toBe('2026-10-14');
    store.dispose();
    // dispose 後はリスナーも外れている。
    fakeNow = new Date(2026, 9, 15, 8, 0);
    window.dispatchEvent(new Event('focus'));
    expect(store.getSnapshot()).toBe('2026-10-14');
  });

  it('待ち時間は最大 1 時間に区切る(深夜まで長い時刻でも 1 時間ごとに確かめる)', () => {
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0));
    const store = createDateRolloverStore();
    store.update({ active: true });
    vi.advanceTimersByTime(60 * 60 * 1000);
    // 1 時間後に確かめ、次のタイマーを張り直している。
    expect(vi.getTimerCount()).toBe(1);
    expect(store.getSnapshot()).toBe('2026-10-12');
    store.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dispose 後に update が来たら(StrictMode の再マウント)見張りをやり直す', () => {
    const store = createDateRolloverStore();
    store.update({ active: true });
    store.dispose();
    expect(vi.getTimerCount()).toBe(0);
    store.update({ active: true });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(store.getSnapshot()).toBe('2026-10-13');
    store.dispose();
  });
});