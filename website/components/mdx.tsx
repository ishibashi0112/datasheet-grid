import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { BasicGridDemo } from '@/components/demo/basic-grid-demo';
import { EditingDemo } from '@/components/demo/editing-demo';
import { FilterSortDemo } from '@/components/demo/filter-sort-demo';
import { LargeDataDemo } from '@/components/demo/large-data-demo';
import { GroupingDemo } from '@/components/demo/grouping-demo';
import { ThemingDemo } from '@/components/demo/theming-demo';
import { ExportDemo } from '@/components/demo/export-demo';
import { SSRMDemo } from '@/components/demo/ssrm-demo';
import { CustomCellsDemo } from '@/components/demo/custom-cells-demo';
import { CustomBarsDemo } from '@/components/demo/custom-bars-demo';
import { CustomEditorDemo } from '@/components/demo/custom-editor-demo';
import { ContextMenuDemo } from '@/components/demo/context-menu-demo';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // ライブデモ(MDX から <XxxDemo /> で埋め込み)
    BasicGridDemo,
    EditingDemo,
    FilterSortDemo,
    LargeDataDemo,
    GroupingDemo,
    ThemingDemo,
    ExportDemo,
    SSRMDemo,
    CustomCellsDemo,
    CustomBarsDemo,
    CustomEditorDemo,
    ContextMenuDemo,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
