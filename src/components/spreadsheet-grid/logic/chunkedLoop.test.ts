// 追加(非依存化 ③-9): runChunked(時間分割ループ)のテストです。yieldToMain は既存のランナーテストと
//   同じく vi.mock で即時解決に差し替えます(MessageChannel の実配信を待たない)。
import { describe, expect, it, vi } from 'vitest';
import { runChunked } from './chunkedLoop';

vi.mock('../utils/scheduler', () => ({
  yieldToMain: (): Promise<void> => Promise.resolve(),
}));

describe('runChunked', () => {
  it('全件を順に visit し、予算 0 のときは 1 件ごとに yield して進捗を通知する', async () => {
    const visited: number[] = [];
    const yields: number[] = [];
    const done = await runChunked(3, (i) => visited.push(i), {
      budgetMs: 0,
      onYield: (n) => yields.push(n),
    });
    expect(done).toBe(true);
    expect(visited).toEqual([0, 1, 2]);
    // 予算 0 → 各チャンク 1 件。最後のチャンク後は yield しない。
    expect(yields).toEqual([1, 2]);
  });

  it('isCancelled が true になったら打ち切って false を返す(以降は visit しない)', async () => {
    const visited: number[] = [];
    let cancelled = false;
    const done = await runChunked(
      5,
      (i) => {
        visited.push(i);
        if (i === 1) cancelled = true;
      },
      { budgetMs: 0, isCancelled: () => cancelled },
    );
    expect(done).toBe(false);
    expect(visited).toEqual([0, 1]);
  });

  it('total = 0 は何もせず true', async () => {
    const visit = vi.fn();
    expect(await runChunked(0, visit)).toBe(true);
    expect(visit).not.toHaveBeenCalled();
  });
});