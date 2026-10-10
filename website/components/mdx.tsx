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
import { ScrollHintDemo } from '@/components/demo/scroll-hint-demo';
import { DetailRowDemo } from '@/components/demo/detail-row-demo';
import { RowDragDemo } from '@/components/demo/row-drag-demo';
import { LabelRowDemo } from '@/components/demo/label-row-demo';
import { SizingDemo } from '@/components/demo/sizing-demo';
import { CellEventsDemo } from '@/components/demo/cell-events-demo';
import { MotionDemo } from '@/components/demo/motion-demo';
import { FindDemo } from '@/components/demo/find-demo';
import { ConditionalFormatDemo } from '@/components/demo/conditional-format-demo';

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
    ScrollHintDemo,
    DetailRowDemo,
    RowDragDemo,
    LabelRowDemo,
    SizingDemo,
    CellEventsDemo,
    MotionDemo,
    FindDemo,
    ConditionalFormatDemo,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
