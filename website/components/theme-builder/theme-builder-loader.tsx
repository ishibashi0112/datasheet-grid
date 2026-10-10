'use client';

// テーマビルダーは初期状態を URL(クエリ)から作るため、クライアントだけで描画する(SSR しない)。
import dynamic from 'next/dynamic';

const ThemeBuilder = dynamic(() => import('./theme-builder').then((m) => m.ThemeBuilder), {
  ssr: false,
  loading: () => <p className="mx-auto w-full max-w-7xl px-6 py-8 text-sm text-fd-muted-foreground">読み込み中…</p>,
});

export function ThemeBuilderLoader() {
  return <ThemeBuilder />;
}
