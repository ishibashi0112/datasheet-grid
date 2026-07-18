'use client';

// インストールコマンドのコピー付きボタン(ランディング用)
import { useState } from 'react';

const COMMAND = 'npm install @ishibashi0112/spreadsheet-grid';

export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-fd-border bg-fd-muted px-4 py-2 font-mono text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(COMMAND).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="クリックでコピー"
    >
      <span aria-hidden>$</span>
      {COMMAND}
      <span className="text-emerald-600 dark:text-emerald-400">
        {copied ? '✓ コピーしました' : '⧉'}
      </span>
    </button>
  );
}