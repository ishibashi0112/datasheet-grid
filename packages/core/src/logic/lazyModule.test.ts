// 追加(lazy-popups): createLazyModule のテストです。
import { describe, expect, it, vi } from 'vitest';
import { createLazyModule } from './lazyModule';

describe('createLazyModule', () => {
  it('load は loader を 1 回だけ呼び、解決で値を保持して購読者へ通知する', async () => {
    const value = { name: 'popover' };
    const loader = vi.fn(() => Promise.resolve(value));
    const lazy = createLazyModule(loader);
    const listener = vi.fn();
    lazy.subscribe(listener);
    expect(lazy.getSnapshot()).toBeNull();

    const first = lazy.load();
    const second = lazy.load();
    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(value);
    expect(lazy.getSnapshot()).toBe(value);
    expect(listener).toHaveBeenCalledTimes(1);

    // 読み込み済みなら loader を呼ばずに同じ値を返し、通知もしない。
    await expect(lazy.load()).resolves.toBe(value);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('失敗したら null のまま通知せず、次の load で読み直す', async () => {
    const value = { name: 'panel' };
    const loader = vi
      .fn<() => Promise<typeof value>>()
      .mockRejectedValueOnce(new Error('chunk load failed'))
      .mockResolvedValueOnce(value);
    const lazy = createLazyModule(loader);
    const listener = vi.fn();
    lazy.subscribe(listener);

    await expect(lazy.load()).rejects.toThrow('chunk load failed');
    expect(lazy.getSnapshot()).toBeNull();
    expect(listener).not.toHaveBeenCalled();

    await expect(lazy.load()).resolves.toBe(value);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(lazy.getSnapshot()).toBe(value);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});