// 追加(lazy-popups): scheduleIdleTask のテストです(requestIdleCallback の有無で分岐)。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleIdleTask } from './scheduler';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('scheduleIdleTask', () => {
  it('requestIdleCallback があればそれで予約し、取り消しは cancelIdleCallback', () => {
    let idleCallback: (() => void) | null = null;
    const requestIdle = vi.fn((cb: () => void, options?: { timeout?: number }) => {
      idleCallback = cb;
      return options?.timeout ?? 0;
    });
    const cancelIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);
    const task = vi.fn();

    const cancel = scheduleIdleTask(task, 1500);
    expect(requestIdle).toHaveBeenCalledTimes(1);
    expect(requestIdle.mock.calls[0]?.[1]).toEqual({ timeout: 1500 });
    expect(task).not.toHaveBeenCalled();
    (idleCallback as (() => void) | null)?.();
    expect(task).toHaveBeenCalledTimes(1);

    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(1500);
  });

  it('requestIdleCallback が無ければ setTimeout で遅らせて走らせ、取り消せる', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const task = vi.fn();
    scheduleIdleTask(task);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const cancel = scheduleIdleTask(cancelled);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(cancelled).not.toHaveBeenCalled();
  });
});