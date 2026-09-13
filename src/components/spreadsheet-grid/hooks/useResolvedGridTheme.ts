// 追加(TH-DK-2 / ダークテーマ): theme prop('light' | 'dark' | 'auto')を実効テーマ
//   ('light' | 'dark')へ解決するフックです。SpreadsheetGrid 本体が使います。
// 変更(非依存化 ③-2): 配色設定の購読は controllers/systemColorSchemeStore(React 非依存の外部 store)、
//   解決は logic/theme.ts の純関数へ分離し、本 hook は useSyncExternalStore で両者を接続するだけです。
//   購読は useSyncExternalStore で行います(effect 先頭 setState を使わないため
//   react-hooks/set-state-in-effect に抵触せず、theme prop の途中切替でも常に最新値)。
//   SSR(Next.js 等)では getServerSnapshot により light 既定で描画し、ハイドレーション後に
//   クライアント側で再解決します(getServerSnapshot 欠如は server render で throw するため必須)。
// 注意: Mantine / HeroUI / Tailwind のクラスベース dark 運用では、ページの実テーマと
//   prefers-color-scheme が一致しないことがあります。その場合は利用側のカラースキーム
//   フックの解決値を 'light' | 'dark' で渡してください(gridTypes.ts の GridTheme 参照)。
import { useSyncExternalStore } from 'react';
import { systemColorSchemeStore } from '../controllers/systemColorSchemeStore';
import { resolveGridTheme, type ResolvedGridTheme } from '../logic/theme';
import type { GridTheme } from '../model/gridTypes';

export function useResolvedGridTheme(theme: GridTheme): ResolvedGridTheme {
  // 'auto' 以外でも購読自体は維持します(フックは無条件呼び出し。購読コストは変化時のみ)。
  const systemPrefersDark = useSyncExternalStore(
    systemColorSchemeStore.subscribe,
    systemColorSchemeStore.getSnapshot,
    systemColorSchemeStore.getServerSnapshot,
  );
  return resolveGridTheme(theme, systemPrefersDark);
}