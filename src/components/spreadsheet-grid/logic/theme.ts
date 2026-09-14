// 追加(非依存化 ③-2): theme prop('light' | 'dark' | 'auto')を実効テーマへ解決する純関数です。
//   'auto' の判定材料(OS / ブラウザの配色設定)は controllers/systemColorSchemeStore が供給します。
import type { GridTheme } from '../model/gridTypes.unbound';

export type ResolvedGridTheme = 'light' | 'dark';

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