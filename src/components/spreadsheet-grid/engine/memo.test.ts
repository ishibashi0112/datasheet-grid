// 追加(本体分解 E-0): createMemo の単体テストです(useMemo と同じ Object.is 比較 / 引数長の違い / NaN)。
import { describe, it, expect, vi } from 'vitest';
import { createMemo } from './memo';

describe('createMemo', () => {
  it('引数がすべて Object.is で同一なら compute を呼ばず前回値を返す', () => {
    const compute = vi.fn((a: number[], b: string) => ({ a, b }));
    const memo = createMemo(compute);
    const arr = [1, 2];
    const first = memo(arr, 'x');
    expect(memo(arr, 'x')).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);

    // 参照が変われば再計算(内容が同じでも useMemo と同じく再計算)。
    const second = memo([1, 2], 'x');
    expect(second).not.toBe(first);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('NaN は同一扱い(Object.is)、-0 と +0 は別扱い', () => {
    const compute = vi.fn((n: number) => ({ n }));
    const memo = createMemo(compute);
    const first = memo(NaN);
    expect(memo(NaN)).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    memo(0);
    memo(-0);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('インスタンスごとに独立したキャッシュを持つ', () => {
    const compute = vi.fn((n: number) => [n]);
    const a = createMemo(compute);
    const b = createMemo(compute);
    a(1);
    b(1);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(a(1)).not.toBe(b(1));
  });
});