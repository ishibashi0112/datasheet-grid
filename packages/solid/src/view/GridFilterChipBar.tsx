// 適用中の列フィルターを上部バーの下にチップで並べるバー(showFilterChipBar。機能 features/filtering の部品)。React 版の
//   view/GridFilterChipBar.tsx と同じ DOM と class。一覧はツールパネルのフィルターのタブと同じもの(要約の文・見えていない列の
//   扱いが同じ)。チップを押すとその列へ移ってフィルターのポップオーバーを開き、× でその列のフィルターを外す。末尾の
//   「すべてクリア」は列フィルターだけ(グローバルフィルターは対象外)。適用中が 0 件ならバーごと出しません。
//   - チップの名前は見えている「列名 + 条件の要約」+ 操作の説明(隠した要素。ボタンの文字に混ぜない)を id で結ぶ。
import { For, Show, createUniqueId } from 'solid-js';
import type { DEFAULT_FILTERING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useFeatureLocaleText } from '../context/localeText';
import type { FilterManagementEntry } from './FilterManagementPanel';

type GridFilterChipBarProps = {
  entries: FilterManagementEntry[];
  canFilter: boolean;
  onEditFilter: (columnKey: string) => void;
  onClearFilter: (columnKey: string) => void;
  onClearAllFilters: () => void;
  slot?: GridResolvedSlot | undefined;
};

export function GridFilterChipBar(props: GridFilterChipBarProps) {
  const texts = useFeatureLocaleText<typeof DEFAULT_FILTERING_LOCALE_TEXT>();
  const chipIdBase = createUniqueId();
  return (
    <Show when={props.entries.length > 0}>
      <div class={['ssg-filter-chip-bar', props.slot?.className]} style={props.slot?.style}>
        <For each={props.entries} keyed={(entry) => entry.columnKey}>
          {(entry, index) => (
            <div class={entry().isHidden ? 'ssg-filter-chip ssg-filter-chip--hidden' : 'ssg-filter-chip'}>
              <button
                type="button"
                class="ssg-filter-chip-label"
                disabled={!props.canFilter || entry().isHidden}
                data-ssg-tooltip={
                  entry().isHidden
                    ? texts().filterJumpUnavailable
                    : entry().isGrouped === true
                      ? texts().filterEditUnderGroup
                      : texts().filterJump
                }
                aria-labelledby={`${chipIdBase}-${index()}-name ${chipIdBase}-${index()}-summary ${chipIdBase}-${index()}-action`}
                onClick={() => props.onEditFilter(entry().columnKey)}
              >
                <span id={`${chipIdBase}-${index()}-name`} class="ssg-filter-chip-name">
                  {entry().title}
                  {entry().isHidden
                    ? texts().filterHiddenColumn
                    : entry().isGrouped === true
                      ? texts().filterGroupedColumn
                      : ''}
                </span>
                <span id={`${chipIdBase}-${index()}-summary`} class="ssg-filter-chip-summary">
                  {entry().summaryText}
                </span>
              </button>
              <button
                type="button"
                class="ssg-filter-chip-clear"
                disabled={!props.canFilter}
                data-ssg-tooltip={texts().filterClear}
                aria-label={formatLocaleText(texts().filterClearFor, { column: entry().title })}
                onClick={() => props.onClearFilter(entry().columnKey)}
              >
                ×
              </button>
              {/* 名前の後半(操作の説明)。ボタンの中に置くと文字に混ざるので外に置きます。 */}
              <span id={`${chipIdBase}-${index()}-action`} hidden>
                {formatLocaleText(texts().filterEditFor, { column: entry().title })}
              </span>
            </div>
          )}
        </For>
        <button
          type="button"
          class="ssg-filter-chip-bar-clear-all"
          disabled={!props.canFilter}
          onClick={() => props.onClearAllFilters()}
        >
          {texts().clearAll}
        </button>
      </div>
    </Show>
  );
}