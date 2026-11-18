// 既定の上部バー(件数・絞り込み・並びの要約)。React 版の view/DefaultGridTopBar.tsx と同じ DOM と class。
//   段階 1(機能なし)の範囲は要約のチップだけ。全体の絞り込みの入力欄と、絞り込みのチップを押してパネルを開く操作は
//   機能(filtering / toolPanel)なので段階 2 で足します。
import { Show } from 'solid-js';
import type { SpreadsheetGridDerivedSummary } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlot } from '../model/gridTypes';

type DefaultGridTopBarProps = {
  derivedSummary: SpreadsheetGridDerivedSummary;
  showSummary: boolean;
  showCounts: boolean;
  slot?: GridResolvedSlot | undefined;
};

export function DefaultGridTopBar(props: DefaultGridTopBarProps) {
  return (
    <div class={['ssg-bar--top', props.slot?.className]} style={props.slot?.style}>
      <div class="ssg-bar-container">
        <Show when={props.showSummary}>
          <div class="ssg-bar-group ssg-bar-leading">
            <Show when={props.showCounts}>
              <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.rowSummaryText}</span>
              <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.columnSummaryText}</span>
            </Show>
            <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.filterSummaryText}</span>
            <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.sortSummaryText}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}