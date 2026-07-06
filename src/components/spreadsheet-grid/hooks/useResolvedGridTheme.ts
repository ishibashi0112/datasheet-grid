// 追加(TH-DK-2 / ダークテーマ): theme prop('light' | 'dark' | 'auto')を実効テーマ
//   ('light' | 'dark')へ解決するフックです。SpreadsheetGrid 本体が使います。
//
// 'auto' の解決:
//   - OS / ブラウザの配色設定(prefers-color-scheme: dark)へ matchMedia で追従します。
//   - 購読は useSyncExternalStore で行います(effect 先頭 setState を使わないため
//     react-hooks/set-state-in-effect に抵触せず、theme prop の途中切替でも常に最新値)。
//   - jsdom / 非対応環境では matchMedia ガードにより常に light 扱いです。
// 注意: Mantine / HeroUI / Tailwind のクラスベース dark 運用では、ページの実テーマと
//   prefers-color-scheme が一致しないことがあります。その場合は利用側のカラースキーム
//   フックの解決値を 'light' | 'dark' で渡してください(gridTypes.ts の GridTheme 参照)。
import { useSyncExternalStore } from 'react';
import type { GridTheme } from '../model/gridTypes';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemColorScheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mediaQueryList = window.matchMedia(DARK_SCHEME_QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => {
    mediaQueryList.removeEventListener('change', onChange);
  };
}

function getSystemPrefersDark(): boolean {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DARK_SCHEME_QUERY).matches;
}

export function useResolvedGridTheme(theme: GridTheme): 'light' | 'dark' {
  // 'auto' 以外でも購読自体は維持します(フックは無条件呼び出し。購読コストは変化時のみ)。
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemColorScheme,
    getSystemPrefersDark,
  );
  if (theme === 'dark') {
    return 'dark';
  }
  if (theme === 'auto') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return 'light';
}