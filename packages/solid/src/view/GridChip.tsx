// 条件付き書式の状態チップ(GridColumn.conditionalFormat.chips)の既定の描画。React 版の view/GridChip.tsx と同じ DOM と class。
//   角丸のピル + 色味ごとのアイコン(色だけで意味を運ばない)+ ラベル。色はトークン --ssg-cf-<tone> / --ssg-cf-<tone>-bg
//   (任意の色は --ssg-cf-chip-color 経由で .ssg-chip--custom)。
import { Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { GridChipSpec, GridChipTone } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.core';
import { resolveChipTone } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';

// React 版の <svg focusable="false">(Solid の型には focusable が無いので属性として渡す。GridHeaderRow と同じ)。
const SVG_NOT_FOCUSABLE = { focusable: 'false' } as Record<string, string>;

// 色味ごとのアイコン(12px の円の中に白い記号)。要素は描くたびに作る(同じ要素を 2 か所に置けないため)。
const ICON_PATHS: Record<GridChipTone, () => JSX.Element> = {
  neutral: () => <circle cx="6" cy="6" r="1.7" fill="currentColor" stroke="none" />,
  info: () => (
    <>
      <path d="M6 5.4v3.3" />
      <path d="M6 3.3v.1" />
    </>
  ),
  good: () => <path d="M3.2 6.3 5.2 8.3 8.9 4.3" />,
  warning: () => (
    <>
      <path d="M6 3.2v3.3" />
      <path d="M6 8.6v.1" />
    </>
  ),
  critical: () => (
    <>
      <path d="M3.9 3.9l4.2 4.2" />
      <path d="M8.1 3.9l-4.2 4.2" />
    </>
  ),
};

export function GridChip(props: { spec: GridChipSpec; children: JSX.Element }) {
  const tone = () => resolveChipTone(props.spec);
  const custom = () => props.spec.color !== undefined && props.spec.color !== '';
  return (
    <span
      class={['ssg-chip', custom() ? 'ssg-chip--custom' : `ssg-chip--${tone()}`]}
      style={custom() ? { '--ssg-cf-chip-color': props.spec.color } : undefined}
    >
      <Show when={props.spec.icon !== false}>
        <span class="ssg-chip-icon" aria-hidden="true">
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            {...SVG_NOT_FOCUSABLE}
          >
            {ICON_PATHS[tone()]()}
          </svg>
        </span>
      </Show>
      <span class="ssg-chip-label">{props.children}</span>
    </span>
  );
}