// ツールパネルの「フィルター」タブの中身(適用中のフィルターの一覧と、編集 = 列へ移ってフィルターを開く / 外す / 追加 /
//   すべて外す)。React 版の view/FilterManagementPanel.tsx と同じ DOM と class。フィルターの状態は持たず、操作は列のキーを
//   呼ぶ側へ渡すだけです(✎ と追加は列フィルターのポップオーバーを開く、× とすべてクリアは状態を変える)。
//   - グローバルフィルター(上部バーの検索欄)は先頭の別の行で、すべてクリアの対象外(行の × でだけ外す)。
//   - 見えていない列のフィルターも出します(✎ は使えない = 開く先が無い。× で外せる)。行のグループ化の最中のグループ元の列は
//     「(グループ化中)」と出し、✎ で自動グループ列の見出しの下に開く。
import { For, Show } from 'solid-js';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { usePopupLocaleText } from '../context/localeText';

// 一覧 1 行ぶん(要約の文は core の logic/filterSummary で作ったもの)。
export type FilterManagementEntry = {
  columnKey: string;
  title: string;
  summaryText: string;
  // 見えていない列(visible: false)。✎ は使えない。
  isHidden: boolean;
  // 行のグループ化の最中のグループ元の列。
  isGrouped?: boolean | undefined;
};

// 「フィルターを追加」の候補(見えている・filterType がある・まだ掛けていない列)。
export type FilterManagementAddableColumn = {
  key: string;
  title: string;
};

type FilterManagementPanelProps = {
  entries: FilterManagementEntry[];
  addableColumns: FilterManagementAddableColumn[];
  // グローバルフィルターの行を出すか(enableGlobalFilter かつ文字があるとき)。
  showGlobalFilterRow: boolean;
  globalFilterText: string;
  canFilter: boolean;
  onEditFilter: (columnKey: string) => void;
  onAddFilter: (columnKey: string) => void;
  onClearFilter: (columnKey: string) => void;
  onClearAllFilters: () => void;
  onClearGlobalFilter: () => void;
};

// React 版の <svg focusable="false">(Solid の型には focusable が無いので属性として渡す。GridHeaderRow と同じ)。
const SVG_NOT_FOCUSABLE = { focusable: 'false' } as Record<string, string>;

// 漏斗(見出しのフィルターの印と同じ形)。
function FunnelGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...SVG_NOT_FOCUSABLE}>
      <path d="M2 4 L14 4 L9.2 9.2 L9.2 13 L6.8 13 L6.8 9.2 Z" />
    </svg>
  );
}

// 虫めがね(上部バーの検索欄のアイコンと同じ形)。
function SearchGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      aria-hidden="true"
      {...SVG_NOT_FOCUSABLE}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function FilterManagementPanel(props: FilterManagementPanelProps) {
  const texts = usePopupLocaleText();
  const canClearAll = () => props.canFilter && props.entries.length > 0;
  const canAdd = () => props.canFilter && props.addableColumns.length > 0;

  return (
    <>
      {/* グローバルフィルターの行(先頭)。すべてクリアの対象外で、外すのはこの行の × だけ。 */}
      <Show when={props.showGlobalFilterRow}>
        <div class="ssg-filter-manage-row ssg-filter-manage-row--global">
          <span class="ssg-filter-manage-glyph ssg-filter-manage-glyph--global" aria-hidden="true">
            <SearchGlyph />
          </span>
          <span class="ssg-filter-manage-main">
            <span class="ssg-filter-manage-name">{texts().globalFilterTitle}</span>
            <span class="ssg-filter-manage-summary" data-ssg-tooltip={props.globalFilterText}>
              {formatLocaleText(texts().globalFilterRows, { text: props.globalFilterText })}
            </span>
          </span>
          <span class="ssg-filter-manage-actions">
            <button
              type="button"
              class="ssg-filter-manage-icon-btn ssg-filter-manage-icon-btn--danger"
              disabled={!props.canFilter}
              data-ssg-tooltip={texts().clearGlobalFilterTitle}
              aria-label={texts().clearGlobalFilterTitle}
              onClick={() => props.onClearGlobalFilter()}
            >
              ×
            </button>
          </span>
        </div>
      </Show>

      {/* 適用中のフィルターの一覧(スクロール) */}
      <div class="ssg-filter-manage-list">
        <Show
          when={props.entries.length > 0}
          fallback={<div class="ssg-filter-manage-empty">{texts().noColumnFilters}</div>}
        >
          <For each={props.entries} keyed={(entry) => entry.columnKey}>
            {(entry) => (
              <div class="ssg-filter-manage-row">
                <span class="ssg-filter-manage-glyph" aria-hidden="true">
                  <FunnelGlyph />
                </span>
                <span class="ssg-filter-manage-main">
                  <span class="ssg-filter-manage-name">
                    {entry().title}
                    <Show when={entry().isHidden}>
                      <span class="ssg-filter-manage-hidden-note">{texts().filterHiddenColumn}</span>
                    </Show>
                    <Show when={entry().isGrouped}>
                      <span class="ssg-filter-manage-hidden-note">{texts().filterGroupedColumn}</span>
                    </Show>
                  </span>
                  <span class="ssg-filter-manage-summary" data-ssg-tooltip={entry().summaryText}>
                    {entry().summaryText}
                  </span>
                </span>
                <span class="ssg-filter-manage-actions">
                  <button
                    type="button"
                    class="ssg-filter-manage-icon-btn"
                    disabled={!props.canFilter || entry().isHidden}
                    data-ssg-tooltip={
                      entry().isHidden
                        ? texts().filterJumpUnavailable
                        : entry().isGrouped === true
                          ? texts().filterEditUnderGroup
                          : texts().filterJump
                    }
                    aria-label={formatLocaleText(texts().filterEditFor, { column: entry().title })}
                    onClick={() => props.onEditFilter(entry().columnKey)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    class="ssg-filter-manage-icon-btn ssg-filter-manage-icon-btn--danger"
                    disabled={!props.canFilter}
                    data-ssg-tooltip={texts().filterClear}
                    aria-label={formatLocaleText(texts().filterClearFor, { column: entry().title })}
                    onClick={() => props.onClearFilter(entry().columnKey)}
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* フッター: フィルターを追加(選ぶとその列へ移ってポップオーバーを開く。値はいつも空 = 選んだら見出しの文へ戻す)+
          すべてクリア */}
      <div class="ssg-popover-footer">
        <select
          class="ssg-filter-manage-add"
          disabled={!canAdd()}
          aria-label={texts().addFilterLabel}
          onChange={(event) => {
            const select = event.currentTarget;
            const key = select.value;
            select.value = '';
            if (key) {
              props.onAddFilter(key);
            }
          }}
        >
          <option value="">{canAdd() ? texts().addFilter : texts().addFilterNone}</option>
          <For each={props.addableColumns} keyed={(column) => column.key}>
            {(column) => <option value={column().key}>{column().title}</option>}
          </For>
        </select>
        <button
          type="button"
          class="ssg-filter-manage-clear-all"
          disabled={!canClearAll()}
          onClick={() => props.onClearAllFilters()}
        >
          {texts().clearAll}
        </button>
      </div>
    </>
  );
}