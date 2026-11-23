'use client';

// ドキュメントのレイアウト。サイドバーの一番上で React / Solid を選び、ページの木(「はじめる」の節)を選んだほうにする。
// 「はじめる」のページ(/docs/react/… と /docs/solid/…)ではそのページのフレームワークで出し、選んだ値もそれに合わせる。
import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import type * as PageTree from 'fumadocs-core/page-tree';
import { FrameworkSidebarSwitch } from '@/components/framework-switch';
import { setFramework, useFramework } from '@/lib/framework';
import { frameworkOfPath, type Framework } from '@/lib/framework-names';

type Props = Omit<DocsLayoutProps, 'tree'> & {
  trees: Record<Framework, PageTree.Root>;
  children: ReactNode;
};

export function FrameworkDocsLayout({ trees, sidebar, children, ...props }: Props) {
  const pathname = usePathname();
  const fromPath = frameworkOfPath(pathname);
  const stored = useFramework();
  const framework = fromPath ?? stored;

  useEffect(() => {
    if (fromPath) setFramework(fromPath);
  }, [fromPath]);

  return (
    <DocsLayout
      {...props}
      tree={trees[framework]}
      sidebar={{ ...sidebar, banner: <FrameworkSidebarSwitch framework={framework} /> }}
    >
      {children}
    </DocsLayout>
  );
}