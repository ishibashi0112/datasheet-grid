// 追加(非依存化 ③-2): resolveGridTheme の純粋テストです。
import { describe, expect, it } from 'vitest';
import { resolveGridTheme } from './theme';

describe('resolveGridTheme', () => {
  it("'light' / 'dark' は配色設定に依らずそのまま返す", () => {
    expect(resolveGridTheme('light', true)).toBe('light');
    expect(resolveGridTheme('dark', false)).toBe('dark');
  });

  it("'auto' は配色設定(prefers-color-scheme: dark)に従う", () => {
    expect(resolveGridTheme('auto', true)).toBe('dark');
    expect(resolveGridTheme('auto', false)).toBe('light');
  });
});