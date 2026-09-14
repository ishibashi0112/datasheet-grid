// 追加(非依存化 ③-9): createValueStore のテストです。
import { describe, expect, it, vi } from 'vitest';
import { createValueStore } from './valueStore';

describe('createValueStore', () => {
  it('値の変更で購読者へ通知し、同値では通知しない。unsubscribe 後は届かない', () => {
    const store = createValueStore(false);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setSnapshot(false);
    expect(listener).not.toHaveBeenCalled();
    store.setSnapshot(true);
    expect(store.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setSnapshot(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});