import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { frameworkTree } from '@/lib/framework-tree';
import { FrameworkDocsLayout } from '@/components/framework-docs-layout';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const tree = source.getPageTree();
  // 変更(Solid を対等に): サイドバーの「はじめる」を React 用と Solid 用に分けた 2 つの木を渡し、選んだほうを出す
  const trees = { react: frameworkTree(tree, 'react'), solid: frameworkTree(tree, 'solid') };
  return (
    <FrameworkDocsLayout trees={trees} {...baseOptions()}>
      {children}
    </FrameworkDocsLayout>
  );
}
