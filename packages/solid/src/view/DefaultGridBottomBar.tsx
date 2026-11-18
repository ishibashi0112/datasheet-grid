// 既定の下部バー(件数・アクティブセル・範囲・選択の大きさ)。React 版の view/DefaultGridBottomBar.tsx と同じ DOM と class。
//   選択範囲の集計(平均 / 個数 / 合計)は機能(selectionAggregates)なので段階 2 で足します。
import { Show } from 'solid-js';
import type { SpreadsheetGridDerivedSummary } from '@ishibashi0112/spreadsheet-grid-core';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';

type DefaultGridBottomBarProps = {
  derivedSummary: SpreadsheetGridDerivedSummary;
  showCounts: boolean;
  slot?: GridResolvedSlot | undefined;
};

export function DefaultGridBottomBar(props: DefaultGridBottomBarProps) {
  const texts = useGridLocaleText();
  return (
    <div class={['ssg-bar--bottom', props.slot?.className]} style={props.slot?.style}>
      <div class="ssg-bar-container">
        <Show when={props.showCounts}>
          <div class="ssg-bar-group">
            <span class="ssg-bar-chip">{props.derivedSummary.rowSummaryText}</span>
            <span class="ssg-bar-chip">{props.derivedSummary.columnSummaryText}</span>
          </div>
        </Show>
        <div class="ssg-bar-group">
          <span class="ssg-bar-chip">
            {formatLocaleText(texts().activeCell, { cell: props.derivedSummary.activeCellLabel })}
          </span>
          <span class="ssg-bar-chip">
            {formatLocaleText(texts().selection, { range: props.derivedSummary.selectionLabel })}
          </span>
          <span class="ssg-bar-chip">{props.derivedSummary.selectionStatsText}</span>
          <span class="ssg-bar-chip">{props.derivedSummary.selectedColumnsText}</span>
        </div>
      </div>
    </div>
  );
}