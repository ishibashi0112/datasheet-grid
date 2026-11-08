// 追加(非依存化 ③-2): theme prop('light' | 'dark' | 'auto')を実効テーマへ解決する純関数です。
//   'auto' の判定材料(OS / ブラウザの配色設定)は controllers/systemColorSchemeStore が供給します。
import type { GridTheme } from '../model/gridTypes.unbound';

export type ResolvedGridTheme = 'light' | 'dark';

// 追加(段階 2 DU-13): root と各ポータルへ付けるテーマの修飾子クラスです。'class' はダークかどうかを JS では決めず、
//   修飾子 ssg-theme-class を付けて、styles.css の「祖先の .dark / [data-theme="dark"] の中の .ssg-theme-class」で
//   ダークのトークンを当てます(CSS だけなのでサーバーの描画から正しい色)。
export const GRID_THEME_CLASS_MODIFIER = 'ssg-theme-class';
export const resolveGridThemeClassName = (theme: GridTheme, systemPrefersDark: boolean): string | undefined =>
  theme === 'class'
    ? GRID_THEME_CLASS_MODIFIER
    : resolveGridTheme(theme, systemPrefersDark) === 'dark'
      ? 'ssg-theme-dark'
      : undefined;

// 'class' は JS からはダークかどうか分からないため 'light' を返します(見た目は CSS が決める。resolveGridThemeClassName を使う)。
export const resolveGridTheme = (
  theme: GridTheme,
  systemPrefersDark: boolean,
): ResolvedGridTheme => {
  if (theme === 'dark') {
    return 'dark';
  }
  if (theme === 'auto') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return 'light';
};