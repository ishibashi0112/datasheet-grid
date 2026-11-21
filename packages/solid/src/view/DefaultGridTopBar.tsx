// 既定の上部バー(件数・絞り込み・並びの要約と、全体の絞り込みの入力欄)。React 版の view/DefaultGridTopBar.tsx と同じ DOM と class。
//   - 要約(showSummary)と入力欄(showFilter)は別々に出し分ける(両方とも出さないときはシェルがバーごと描かない)。
//   - 絞り込みの要約は、onFilterSummaryClick があるときだけボタン(フィルター管理のパネルを開閉。ツールパネルの機能)。
//   - 入力欄の値は検索の文字(applyState や × でも変わる)。今の値と違うときだけ書きます(式で渡すと、同じ要素の別の属性が
//     変わるたびに Solid が value を書き直し、変換中の文字が消える)。
import { Show, createMemo, createRenderEffect, createSignal, createUniqueId, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { SpreadsheetGridDerivedSummary } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';

// 既定の左アイコン(検索。currentColor で .ssg-bar-input-icon の色を継ぐ。React 版と同じ形)。
const DefaultFilterIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5" />
    <line x1="10.6" y1="10.6" x2="14.5" y2="14.5" />
  </svg>
);

// クリア(×)のアイコン(入力枠の内側右のボタン)。
const ClearIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </svg>
);

type DefaultGridTopBarProps = {
  derivedSummary: SpreadsheetGridDerivedSummary;
  globalFilterText: string;
  setGlobalFilterText: (value: string) => void;
  showSummary: boolean;
  showFilter: boolean;
  showCounts: boolean;
  // 入力欄の placeholder(未指定は文言 globalFilterPlaceholder)。
  globalFilterPlaceholder?: string | undefined;
  // 入力欄の左アイコン。undefined = 既定の検索アイコン / null など falsy = アイコン無し / それ以外 = 差し替え。
  globalFilterIcon?: JSX.Element | undefined;
  // 絞り込みの要約を押したとき(フィルター管理のパネルの開閉)。無ければ要約は押せない span。
  onFilterSummaryClick?: (() => void) | undefined;
  // フィルター管理のパネルが開いているか(要約のボタンの aria-expanded)。
  filterPanelOpen?: boolean | undefined;
  slot?: GridResolvedSlot | undefined;
};

export function DefaultGridTopBar(props: DefaultGridTopBarProps) {
  const texts = useGridLocaleText();
  // 絞り込みの要約ボタンの名前 = 見えている要約 + 操作の説明(aria-labelledby。説明はボタンの外の隠した要素。React 版と同じ)。
  const filterSummaryId = createUniqueId();
  const placeholder = () => props.globalFilterPlaceholder ?? texts().globalFilterPlaceholder;
  const [input, setInput] = createSignal<HTMLInputElement>();
  const initialText = untrack(() => props.globalFilterText);
  createRenderEffect(
    () => [input(), props.globalFilterText] as const,
    ([element, text]) => {
      if (element && element.value !== text) {
        element.value = text;
      }
    },
    { name: 'globalFilterInput' },
  );
  const hasFilterText = () => props.globalFilterText.trim().length > 0;
  // 左アイコンは 1 回だけ読みます(利用側が JSX で渡した要素は、prop を読むたびに作り直される)。
  const filterIcon = createMemo(() => {
    const icon = props.globalFilterIcon;
    return icon === undefined ? <DefaultFilterIcon /> : icon;
  });

  return (
    <div class={['ssg-bar--top', props.slot?.className]} style={props.slot?.style}>
      <div class="ssg-bar-container">
        <Show when={props.showSummary}>
          <div class="ssg-bar-group ssg-bar-leading">
            <Show when={props.showCounts}>
              <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.rowSummaryText}</span>
              <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.columnSummaryText}</span>
            </Show>
            <Show
              when={props.onFilterSummaryClick}
              fallback={<span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.filterSummaryText}</span>}
            >
              {(onClick) => (
                // pointerdown を止めるのは、パネルを開いているときの押下が「pointerdown で外側として閉じる → click で
                //   開き直す」と相殺してトグルにならないのを防ぐため(React 版と同じ)。
                <button
                  type="button"
                  class="ssg-bar-chip ssg-bar-chip--emphasis ssg-bar-chip--action"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onClick()()}
                  aria-haspopup="dialog"
                  aria-expanded={props.filterPanelOpen === true ? 'true' : 'false'}
                  data-ssg-tooltip={texts().toggleFilterPanel}
                  aria-labelledby={`${filterSummaryId}-text ${filterSummaryId}-action`}
                >
                  <span id={`${filterSummaryId}-text`}>{props.derivedSummary.filterSummaryText}</span>
                </button>
              )}
            </Show>
            <span class="ssg-bar-chip ssg-bar-chip--emphasis">{props.derivedSummary.sortSummaryText}</span>
            <Show when={props.onFilterSummaryClick}>
              <span id={`${filterSummaryId}-action`} hidden>
                {texts().toggleFilterPanel}
              </span>
            </Show>
          </div>
        </Show>
        <Show when={props.showFilter}>
          <div class="ssg-bar-input-group">
            <Show when={filterIcon()}>
              {(icon) => (
                <span class="ssg-bar-input-icon" aria-hidden="true">
                  {icon()}
                </span>
              )}
            </Show>
            <input
              ref={setInput}
              type="text"
              value={initialText}
              onInput={(event) => props.setGlobalFilterText(event.currentTarget.value)}
              placeholder={placeholder()}
              // placeholder だけだと値の入力後に名前が消える UA があるため、名前を明示する(空文字のときだけ既定の名前)。
              aria-label={placeholder() || texts().globalFilterLabel}
              class="ssg-bar-input"
            />
            <Show when={hasFilterText()}>
              <button
                type="button"
                onClick={() => props.setGlobalFilterText('')}
                class="ssg-bar-input-clear"
                aria-label={texts().clearGlobalFilter}
                data-ssg-tooltip={texts().clear}
              >
                <ClearIcon />
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}