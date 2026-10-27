'use client';

// ことばで絞り込みのデモは入口 /ai(全部入りとは別のファイル)を読み込むので、ほかのページの JS に入らないよう遅延読み込みにする。
import dynamic from 'next/dynamic';

const AiFilterDemo = dynamic(() => import('./ai-filter-demo').then((m) => m.AiFilterDemo), {
  ssr: false,
  loading: () => <p className="text-sm text-fd-muted-foreground">読み込み中…</p>,
});

export function AiFilterDemoLoader() {
  return <AiFilterDemo />;
}