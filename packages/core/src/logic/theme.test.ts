// 追加(非依存化 ③-2): resolveGridTheme の純粋テストです。
import { describe, expect, it } from 'vitest';
import { resolveGridTheme, resolveGridThemeClassName } from './theme';

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

// 追加(段階 2 DU-13): root と各ポータルへ付ける修飾子クラス。'class' は配色設定に依らず ssg-theme-class(ダークかは CSS)。
describe('resolveGridThemeClassName', () => {
  it("'dark' / ダークに解決した 'auto' は ssg-theme-dark、'light' と light の 'auto' は付けない、'class' は ssg-theme-class", () => {
    expect(resolveGridThemeClassName('dark', false)).toBe('ssg-theme-dark');
    expect(resolveGridThemeClassName('auto', true)).toBe('ssg-theme-dark');
    expect(resolveGridThemeClassName('auto', false)).toBeUndefined();
    expect(resolveGridThemeClassName('light', true)).toBeUndefined();
    expect(resolveGridThemeClassName('class', true)).toBe('ssg-theme-class');
    expect(resolveGridThemeClassName('class', false)).toBe('ssg-theme-class');
  });
});