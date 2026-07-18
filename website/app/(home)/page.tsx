import Link from 'next/link';
import type { Metadata } from 'next';
import { HeroGridDemo } from '@/components/demo/hero-grid-demo';
import { InstallCommand } from '@/components/install-command';

export const metadata: Metadata = {
  title: 'SpreadsheetGrid — React 19 製の仮想化データグリッド',
  description:
    '100 万行対応の仮想化・Excel ライクな編集・SSRM(サーバーサイド行モデル)・行グルーピング。Tailwind / Mantine / HeroUI と共存できる React 19 製データグリッド。',
};

const BULLETS = [
  '100 万行対応の仮想化 + 3 ペイン固定列',
  'Excel ライクな編集・コピペ・undo/redo(IME 対応)',
  'SSRM: サーバ取得・楽観更新・ロールバック',
  'Tailwind / Mantine / HeroUI と共存する CSS 設計',
];

const FEATURES = [
  {
    title: '仮想化',
    body: '〜100 万行をスムーズに',
    href: '/docs/guides/large-data',
  },
  {
    title: '編集',
    body: 'エディタ 6 種 + バリデーション',
    href: '/docs/guides/editing',
  },
  {
    title: 'SSRM',
    body: 'サーバ取得 + 書き戻し',
    href: '/docs/guides/ssrm',
  },
  {
    title: 'グルーピング',
    body: '階層 + 集計',
    href: '/docs/guides/grouping',
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-12 lg:grid-cols-[5fr_7fr] lg:py-16">
        <div>
          <p className="text-xs font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
            REACT 19 / TYPESCRIPT
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            <span className="inline-block">データグリッドは、</span>
            <span className="inline-block">触れば分かる。</span>
          </h1>
          <p className="mt-4 text-fd-muted-foreground">
            React 19 製の仮想化スプレッドシート。右のグリッドは実物です —
            セルをダブルクリックして編集してみてください。
          </p>
          <ul className="mt-5 space-y-1.5 text-sm">
            {BULLETS.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 text-emerald-600 dark:text-emerald-400"
                >
                  ▣
                </span>
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/docs"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
            >
              はじめる
            </Link>
            <InstallCommand />
          </div>
        </div>
        <HeroGridDemo />
      </div>

      <div className="border-t">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-fd-border md:grid-cols-4">
          {FEATURES.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group px-5 py-4 transition-colors hover:bg-fd-accent"
            >
              <p className="text-sm font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                {feature.title}
              </p>
              <p className="text-xs text-fd-muted-foreground">{feature.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}