// 追加(TH-DK-2 / ダークテーマ): theme prop('light' | 'dark' | 'auto' | 'class')を修飾子クラス
//   ('ssg-theme-dark' | 'ssg-theme-class' | なし)へ解決するフックです。SpreadsheetGrid 本体が使います。
// 変更(非依存化 ③-2): 配色設定の購読は controllers/systemColorSchemeStore(React 非依存の外部 store)、
//   解決は logic/theme.ts の純関数へ分離し、本 hook は useSyncExternalStore で両者を接続するだけです。
//   購読は useSyncExternalStore で行います(effect 先頭 setState を使わないため
//   react-hooks/set-state-in-effect に抵触せず、theme prop の途中切替でも常に最新値)。
//   SSR(Next.js 等)では getServerSnapshot により light 既定で描画し、ハイドレーション後に
//   クライアント側で再解決します(getServerSnapshot 欠如は server render で throw するため必須)。
// 注意: Tailwind / next-themes などの <html class="dark"> 運用では theme="class"(CSS だけで祖先の .dark に追従)、
//   Mantine のようにほかの方法でダークを決めるものは利用側の解決値を 'light' | 'dark' で渡します。
import { useSyncExternalStore } from 'react';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/systemColorSchemeStore';
import { resolveGridThemeClassName } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/theme';
import type { GridTheme } from '../model/gridTypes';

// 変更(段階 2 DU-13): 実効テーマではなく、root と各ポータルへ付ける修飾子クラス('ssg-theme-dark' / 'ssg-theme-class' / なし)を返します。
export function useResolvedGridTheme(theme: GridTheme): string | undefined {
  // 'auto' 以外でも購読自体は維持します(フックは無条件呼び出し。購読コストは変化時のみ)。
  const systemPrefersDark = useSyncExternalStore(
    systemColorSchemeStore.subscribe,
    systemColorSchemeStore.getSnapshot,
    systemColorSchemeStore.getServerSnapshot,
  );
  return resolveGridThemeClassName(theme, systemPrefersDark);
}