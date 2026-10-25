'use client';

// /lite のデモは全部入りとは別のビルド(`/lite`)を読み込むので、ほかのページの JS に入らないよう遅延読み込みにする。
import dynamic from 'next/dynamic';

const LiteDemo = dynamic(() => import('./lite-demo').then((m) => m.LiteDemo), {
  ssr: false,
  loading: () => <p className="text-sm text-fd-muted-foreground">読み込み中…</p>,
});

export function LiteDemoLoader() {
  return <LiteDemo />;
}