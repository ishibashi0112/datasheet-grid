// ツールパネルの「列」「並び替え」タブの行の ⠿ ドラッグハンドルの見た目(2×3 の点)。React 版は ColumnChooserPanel.tsx と
//   SortManagementPanel.tsx に同じものを 1 つずつ持つ。押下の処理は行の側にあり、ここは見た目だけ。
//   fill はプレゼンテーション属性だと var() を読まないので style で書きます(React 版と同じ)。
import { For } from 'solid-js';

const DOTS: { cx: number; cy: number }[] = [3, 8, 13].flatMap((cy) => [3, 7].map((cx) => ({ cx, cy })));

export function DragHandleGlyph(props: { disabled: boolean }) {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      style={{ fill: props.disabled ? 'var(--ssg-panel-text-disabled)' : 'var(--ssg-panel-text-faint)' }}
      aria-hidden="true"
    >
      <For each={DOTS}>{(dot) => <circle cx={dot.cx} cy={dot.cy} r="1.2" />}</For>
    </svg>
  );
}