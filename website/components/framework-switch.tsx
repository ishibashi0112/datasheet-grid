'use client';

// React / Solid の切り替え(lib/framework の値を変える)。ランディングのロゴのボタンと、サイドバーの一番上の切り替え。
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { setFramework, useFramework } from '@/lib/framework';
import {
  FRAMEWORKS,
  FRAMEWORK_LABEL,
  FRAMEWORK_VERSION,
  counterpartPath,
  type Framework,
} from '@/lib/framework-names';

export function FrameworkIcon({ framework, className }: { framework: Framework; className?: string }) {
  if (framework === 'react') {
    return (
      <svg viewBox="-11.5 -10.23 23 20.46" aria-hidden className={cn('size-4 shrink-0 text-[#0a7ea4] dark:text-[#61dafb]', className)}>
        <circle r="2.05" fill="currentColor" />
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <ellipse rx="11" ry="4.2" />
          <ellipse rx="11" ry="4.2" transform="rotate(60)" />
          <ellipse rx="11" ry="4.2" transform="rotate(120)" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn('size-4 shrink-0 text-[#2c4f7c] dark:text-[#8fb3e8]', className)}>
      <path d="M2 5.2 8.6 2.4l5.4 2.3-6.6 2.8z" fill="currentColor" opacity="0.9" />
      <path d="M2 10.8l6.6-2.8 5.4 2.3-6.6 2.8z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

// ランディングのヒーローのボタン(選んだほうでインストールのコマンドと StackBlitz が替わる)。
export function FrameworkChips({ className }: { className?: string }) {
  const framework = useFramework();
  return (
    <div role="group" aria-label="フレームワーク" className={cn('flex flex-wrap gap-2', className)}>
      {FRAMEWORKS.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={framework === item}
          onClick={() => setFramework(item)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            framework === item
              ? 'border-emerald-600 bg-emerald-50 text-fd-foreground dark:border-emerald-400 dark:bg-emerald-950/40'
              : 'border-fd-border text-fd-muted-foreground hover:text-fd-foreground',
          )}
        >
          <FrameworkIcon framework={item} />
          {FRAMEWORK_LABEL[item]}
          <span className="text-[11px] font-normal text-fd-muted-foreground">{FRAMEWORK_VERSION[item]}</span>
        </button>
      ))}
    </div>
  );
}

// サイドバーの一番上の切り替え。「はじめる」のページにいるときは、もう片方のフレームワークの同じ役目のページへ移る。
export function FrameworkSidebarSwitch({ framework }: { framework: Framework }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div role="group" aria-label="フレームワーク" className="grid grid-cols-2 gap-1 rounded-lg border bg-fd-muted p-1">
      {FRAMEWORKS.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={framework === item}
          onClick={() => {
            setFramework(item);
            const next = counterpartPath(pathname, item);
            if (next) router.push(next);
          }}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
            framework === item
              ? 'bg-fd-background text-fd-foreground shadow-sm'
              : 'text-fd-muted-foreground hover:text-fd-foreground',
          )}
        >
          <FrameworkIcon framework={item} />
          {FRAMEWORK_LABEL[item]}
        </button>
      ))}
    </div>
  );
}
