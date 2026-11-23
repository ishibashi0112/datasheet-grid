'use client';

// インストールコマンドのコピー付きボタン(ランディング用)。選んだフレームワーク(lib/framework)のパッケージを出す。
import { useState } from 'react';
import { useFramework } from '@/lib/framework';

const COMMAND = {
  react: 'npm install @ishibashi0112/spreadsheet-grid',
  solid: 'npm install @ishibashi0112/spreadsheet-grid-solid',
} as const;

export function InstallCommand() {
  const [copied, setCopied] = useState(false);
  const command = COMMAND[useFramework()];

  return (
    <button
      type="button"
      className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-fd-border bg-fd-muted px-4 py-2 font-mono text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="クリックでコピー"
    >
      {/* break-all: 幅 390px 前後のスマホで 1 行に収まらないため折り返しを許可します
          (nowrap のままだと min-content 幅でページ全体が横はみ出しする)。 */}
      <span className="break-all text-left">
        <span aria-hidden>$ </span>
        {command}
      </span>
      <span className="text-emerald-600 dark:text-emerald-400">
        {copied ? '✓ コピーしました' : '⧉'}
      </span>
    </button>
  );
}
