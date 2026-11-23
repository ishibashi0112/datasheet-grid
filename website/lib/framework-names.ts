// フレームワーク(React / Solid)の名前と、ページの URL との対応。サーバーとクライアントの両方から使う
// (lib/framework.ts は 'use client' の状態なので、サーバーで使う値はこちらに置く)。

export type Framework = 'react' | 'solid';

export const FRAMEWORKS: readonly Framework[] = ['react', 'solid'];

export const FRAMEWORK_LABEL: Record<Framework, string> = { react: 'React', solid: 'Solid' };

export const FRAMEWORK_VERSION: Record<Framework, string> = { react: '18.3 / 19', solid: '2.0' };

// コードのタブの名前("React" / "Solid")からフレームワークへ。ほかの名前(npm / pnpm など)は null。
export function frameworkOfTab(value: unknown): Framework | null {
  if (value === 'React') return 'react';
  if (value === 'Solid') return 'solid';
  return null;
}

// 「はじめる」のページ(/docs/react/… と /docs/solid/…)ならそのフレームワーク。共通のページは null。
export function frameworkOfPath(pathname: string): Framework | null {
  for (const framework of FRAMEWORKS) {
    if (pathname === `/docs/${framework}` || pathname.startsWith(`/docs/${framework}/`)) return framework;
  }
  return null;
}

// 「はじめる」のページで切り替えたときに移る、もう片方のフレームワークの同じ役目のページ。
const COUNTERPART: Record<Framework, Record<string, string>> = {
  react: { installation: 'installation', 'quick-start': 'quick-start', notes: 'notes', nextjs: 'ssr' },
  solid: { installation: 'installation', 'quick-start': 'quick-start', notes: 'notes', ssr: 'nextjs' },
};

export function counterpartPath(pathname: string, to: Framework): string | null {
  const from = frameworkOfPath(pathname);
  if (from === null || from === to) return null;
  const slug = pathname.slice(`/docs/${from}/`.length).replace(/\/$/, '');
  return `/docs/${to}/${COUNTERPART[from][slug] ?? 'installation'}`;
}