'use client';

// ランディングのヒーローのボタン。React / Solid を選ぶと、StackBlitz のサンプルとインストールのコマンドがそのフレームワークになる。
import Link from 'next/link';
import { FrameworkChips } from '@/components/framework-switch';
import { InstallCommand } from '@/components/install-command';
import { FRAMEWORK_LABEL, useFramework } from '@/lib/framework';

// インストールなしで動かせるサンプル(リポジトリの examples/basic と examples/solid)を StackBlitz で開く。
const STACKBLITZ_URL = {
  react: 'https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/basic?file=src/App.tsx&terminal=dev',
  solid: 'https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/solid?file=src/App.tsx&terminal=dev',
} as const;

export function HeroActions() {
  const framework = useFramework();
  return (
    <>
      <FrameworkChips className="mt-6" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href="/docs"
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
        >
          はじめる
        </Link>
        <a
          href={STACKBLITZ_URL[framework]}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-fd-accent"
        >
          StackBlitz で試す({FRAMEWORK_LABEL[framework]})
        </a>
        <InstallCommand />
      </div>
    </>
  );
}
