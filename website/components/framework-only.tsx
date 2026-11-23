// ガイドの中の、片方のフレームワークだけの話に付ける印(MDX から <FrameworkOnly framework="react">…</FrameworkOnly>)。
// 例: Next.js の App Router・Mantine / Astryx の React の部品・React 18 の forwardRef。
import type { ReactNode } from 'react';
import { FrameworkIcon } from '@/components/framework-switch';
import { FRAMEWORK_LABEL, type Framework } from '@/lib/framework-names';

export function FrameworkOnly({ framework, children }: { framework: Framework; children?: ReactNode }) {
  return (
    <div className="my-4 flex flex-wrap items-center gap-2 text-sm text-fd-muted-foreground">
      <span className="inline-flex items-center gap-1 rounded-full border bg-fd-muted px-2 py-0.5 text-xs font-medium text-fd-foreground">
        <FrameworkIcon framework={framework} className="size-3.5" />
        {FRAMEWORK_LABEL[framework]} だけ
      </span>
      {children ? <span>{children}</span> : null}
    </div>
  );
}