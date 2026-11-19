// 既定の下部バー(件数・アクティブセル・範囲・選択の大きさ)。React 版の view/DefaultGridBottomBar.tsx と同じ DOM と class。
//   選択範囲の集計(平均 / 個数 / 合計)は機能(features/selectionAggregates)の部品で、ある構成だけ出します。置き場所は
//   React 版と同じ: 件数あり = [件数][集計(空きを埋めて右寄せ)][右グループ]、件数なし = [右グループ][集計(左寄せ)]。
import { Show } from 'solid-js';
import type {
  GridSelectionAggregates as GridSelectionAggregatesValue,
  SpreadsheetGridDerivedSummary,
} from '@ishibashi0112/spreadsheet-grid-core';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import type { GridSelectionAggregates } from './GridSelectionAggregates';

type DefaultGridBottomBarProps = {
  derivedSummary: SpreadsheetGridDerivedSummary;
  showCounts: boolean;
  slot?: GridResolvedSlot | undefined;
  selectionAggregates?: GridSelectionAggregatesValue | null | undefined;
  // 集計の表示部品(機能 features/selectionAggregates から。無ければ出さない)。
  SelectionAggregates?: typeof GridSelectionAggregates | undefined;
};

export function DefaultGridBottomBar(props: DefaultGridBottomBarProps) {
  const texts = useGridLocaleText();
  const aggregates = (trailing: boolean) => {
    const SelectionAggregates = props.SelectionAggregates;
    return SelectionAggregates ? (
      <SelectionAggregates aggregates={props.selectionAggregates} trailing={trailing} />
    ) : null;
  };
  return (
    <div class={['ssg-bar--bottom', props.slot?.className]} style={props.slot?.style}>
      <div class="ssg-bar-container">
        <Show when={props.showCounts}>
          <div class="ssg-bar-group">
            <span class="ssg-bar-chip">{props.derivedSummary.rowSummaryText}</span>
            <span class="ssg-bar-chip">{props.derivedSummary.columnSummaryText}</span>
          </div>
          {aggregates(false)}
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
        <Show when={!props.showCounts}>{aggregates(true)}</Show>
      </div>
    </div>
  );
}