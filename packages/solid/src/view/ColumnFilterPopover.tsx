// 列フィルターのポップオーバー(機能 features/filtering の部品)。React 版の view/ColumnFilterPopover.tsx と同じ DOM と class。
//   種別ごとの中身:
//   - text / date / custom: 部分一致の文字(適用 / Enter で確定)。
//   - number: 演算子 + 値(0〜2 個。適用 / Enter で確定)。
//   - select: 候補の select(適用 / Enter で確定)。
//   - set: 値の一覧(検索 + すべて選択 + チェック。押したらすぐ反映。候補が多いときは仮想化)。
//   - numberSet / textSet / dateSet: 条件 + 値の一覧の組み合わせ(どちらもすぐ反映。条件で値の候補が絞られる。dateSet の値は
//     年 / 月 / 日の木で、条件には相対の期間のチップ)。
//   候補を集めている間(大きな表)/ getFilterOptions で取っている間・失敗したときは、一覧の位置に進み具合 / 状態を出します
//   (条件と値の組み合わせの列は、条件の欄を出したまま)。
//   - パネルの中のキー / 押下はグリッドへ流しません。Escape は中の部品が扱っていなければ閉じ、Tab はパネルの中で回します。
//   - 入力欄の value は今の値と違うときだけ書きます(IME の変換中の文字を消さない)。チェックボックスは状態から決めた値で
//     書き直します(React 版の制御された入力欄と同じ)。
import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import { Portal } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { isEscapePreventedInside } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/escapeClaimController';
import { resolveFocusWrapTarget } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/focusCycle';
import type { ConditionDraftChangeOptions } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/filterPopoverCommands';
import type { ColumnSelectOptionsStatus } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectOptionsCollector';
import type { FilterPopoverLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/filterPopoverController';
import {
  filterSetOptionsBySearch,
  resolveSetFilterEnterAction,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/setFilterSearch';
import {
  isSetValueSelected,
  type ColumnFilterSetSelection,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/setFilterSelection';
import {
  DEFAULT_NUMBER_FILTER_DRAFT,
  NUMBER_FILTER_OPERATOR_OPTIONS,
  buildParsedNumberFilterFromDraft,
  filterOptionsByNumberCondition,
  numberFilterOperandCount,
  type NumberFilterConditionDraft,
  type NumberFilterOperator,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/numberFilterCondition';
import {
  DEFAULT_TEXT_FILTER_DRAFT,
  TEXT_FILTER_OPERATOR_OPTIONS,
  buildParsedTextFilterFromDraft,
  filterOptionsByTextCondition,
  textFilterOperandCount,
  type TextFilterConditionDraft,
  type TextFilterOperator,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/textFilterCondition';
import {
  DATE_FILTER_OPERATOR_OPTIONS,
  DEFAULT_DATE_FILTER_DRAFT,
  buildParsedDateFilterFromDraft,
  dateFilterOperandCount,
  filterOptionsByDateCondition,
  normalizeFilterDateInputValue,
  type DateFilterConditionDraft,
  type DateFilterOperator,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/dateFilterCondition';
import {
  normalizeDateFilterPresets,
  type NormalizedDateFilterPreset,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/dateFilterPresets';
import { buildDateTreeRows, type DateTreeRow } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/dateFilterTree';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { DEFAULT_FILTER_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFilters';
import type { ColumnFilterUiType, FilterDateInputContext } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useGridPortal } from '../context/portal';
import { usePopupLocaleText } from '../context/localeText';
import { createPortalTokens } from '../primitives/portalTokens';
import { createColumnVirtualizer } from '../primitives/columnVirtualizer';
import { controlledToggle, createIndeterminate, createInputValue } from '../primitives/inputValue';
import { px } from '../primitives/style';
import { FilterDateField } from './FilterDateField';
import { readEventKey } from '../primitives/eventKey';

// 日付の入力欄の差し替え(columnKey は呼ぶ側が足す)。
export type ColumnFilterDateInputRenderer = (ctx: Omit<FilterDateInputContext, 'columnKey'>) => JSX.Element;

export type ColumnFilterPopoverOption = {
  label: string;
  value: string;
};

type ElementHolder<E> = { current: E | null };

// 渡された要素を holder に入れ、部品が消えたら(同じ要素のままなら)外します(React の ref と同じ)。部品の本体で呼び、戻り値を ref に
//   渡します(Solid は ref の中で onCleanup を使えない)。
const createHeldRef = <E,>(holder: () => ElementHolder<E> | undefined): ((element: E) => void) => {
  let held: E | undefined;
  onCleanup(() => {
    const target = untrack(holder);
    if (target && held !== undefined && target.current === held) {
      target.current = null;
    }
  });
  return (element) => {
    held = element;
    const target = untrack(holder);
    if (target) {
      target.current = element;
    }
  };
};

// 値の一覧の行の高さ(仮想化の見積もりと同じ。タッチが主の端末は 40px = CSS の (pointer: coarse) と同じ)。
const SET_FILTER_OPTION_ROW_HEIGHT = 24;
const SET_FILTER_OPTION_ROW_HEIGHT_COARSE = 40;
const resolveSetFilterOptionRowHeight = (): number =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches
    ? SET_FILTER_OPTION_ROW_HEIGHT_COARSE
    : SET_FILTER_OPTION_ROW_HEIGHT;

// 集めた候補の空白(値が空で、ラベルが既定の「(空白)」)は文言の表の blank で出します(利用側が渡したラベルはそのまま)。
const displayOptionLabel = (value: string, label: string, blank: string): string =>
  value === '' && label === DEFAULT_FILTER_LOCALE_TEXT.blank ? blank : label;

// 候補の検索は画面に出すラベルで見ます(既定の日本語のままなら同じ配列)。
const withDisplayBlankLabel = (options: ColumnFilterPopoverOption[], blank: string): ColumnFilterPopoverOption[] =>
  blank === DEFAULT_FILTER_LOCALE_TEXT.blank
    ? options
    : options.map((option) =>
        option.value === '' && option.label === DEFAULT_FILTER_LOCALE_TEXT.blank ? { ...option, label: blank } : option,
      );

// ポップオーバーの中のボタンのキーはグリッドへ流しません。Escape だけはパネルへ通し、パネルが閉じます。
const stopButtonKeyPropagation = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') {
    event.stopPropagation();
  }
};

// pointerdown で押すボタン(フォーカスを奪わない)。Enter / Space でも押せます。
const pressHandlers = (action: () => void) => ({
  onPointerDown: (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  },
  onKeyDown: (event: KeyboardEvent) => {
    stopButtonKeyPropagation(event);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  },
});

// IME の変換中の打鍵は下書きだけ変えて、絞り込みは確定まで待ちます(commit: false)。
const notifyDraftChange = <D,>(
  onDraftChange: (draft: D, options?: ConditionDraftChangeOptions) => void,
  draft: D,
  event: Event,
): void => {
  if ((event as Partial<InputEvent>).isComposing === true) {
    onDraftChange(draft, { commit: false });
    return;
  }
  onDraftChange(draft);
};

// 選ばれている数(候補に含まれる値だけを数える。条件で候補が絞られていても、候補の外の選択は数えない)。
const countSelectedInOptions = (
  selection: ColumnFilterSetSelection | null,
  optionValues: ReadonlySet<string>,
  optionCount: number,
): number => {
  if (selection === null) {
    return optionCount;
  }
  let inList = 0;
  for (const value of selection.values) {
    if (optionValues.has(value)) {
      inList += 1;
    }
  }
  return selection.mode === 'include' ? inList : optionCount - inList;
};

// 候補が途中までのときの注記。
function TruncatedNote() {
  const texts = usePopupLocaleText();
  return <span class="ssg-filter-truncated">{texts().filterOptionsTruncated}</span>;
}

// 値の一覧の空のときの文言(候補が無い / serverSide で候補が渡されていない / 検索に当たらない)。
const emptyListText = (
  texts: ReturnType<ReturnType<typeof usePopupLocaleText>>,
  optionCount: number,
  isServerSide: boolean,
): string =>
  optionCount === 0 ? (isServerSide ? texts.filterNoOptionsSource : texts.noOptions) : texts.filterNoMatches;

// ── set の値の一覧(検索 + すべて選択 + チェック) ──
type SetFilterBodyProps = {
  options: ColumnFilterPopoverOption[];
  // null = すべて選択(フィルターなし)。
  setSelection: ColumnFilterSetSelection | null;
  searchInputRef: ElementHolder<HTMLInputElement>;
  onValueToggle: (value: string) => void;
  onSelectAllChange: (scope: 'all' | string[], nextSelected: boolean) => void;
  // 検索の Enter で「当たった値だけ」に置き換える。
  onReplaceSelection: (values: string[]) => void;
  onRequestClose: () => void;
  isServerSide: boolean;
  // すべて選択をいつも表示中の候補の値で知らせる(条件で候補が絞られる numberSet / textSet)。
  selectAllUsesExplicitScope?: boolean | undefined;
  truncated?: boolean | undefined;
};

function SetFilterBody(props: SetFilterBodyProps) {
  const texts = usePopupLocaleText();
  const [searchText, setSearchText] = createSignal('');
  const searchOptions = createMemo(() => withDisplayBlankLabel(props.options, texts().blank));
  const visibleOptions = createMemo(() => filterSetOptionsBySearch(searchOptions(), searchText()));
  const isSearching = createMemo(() => searchText().trim().length > 0);

  // 候補の一覧の仮想化(見えている範囲 + 前後 10 行だけを描く)。
  let listElement: HTMLDivElement | undefined;
  const optionRowHeight = resolveSetFilterOptionRowHeight();
  const virtualizer = createColumnVirtualizer<HTMLDivElement>(() => ({
    count: visibleOptions().length,
    getScrollElement: () => listElement ?? null,
    estimateSize: () => optionRowHeight,
    overscan: 10,
  }));
  const virtualRows = createMemo(() => {
    const options = visibleOptions();
    return virtualizer.items().flatMap((item) => {
      const option = options[item.index];
      return option ? [{ option, start: item.start, size: item.size }] : [];
    });
  });
  const totalSize = createMemo(() => {
    virtualizer.items();
    return virtualizer.instance.getTotalSize();
  });

  // (すべて選択)の 3 つの状態(表示中の候補が対象)。
  const visibleSelectedCount = createMemo(() => {
    const selection = props.setSelection;
    const options = visibleOptions();
    if (selection === null) {
      return options.length;
    }
    let count = 0;
    for (const option of options) {
      if (isSetValueSelected(selection, option.value)) {
        count += 1;
      }
    }
    return count;
  });
  const isAllVisibleSelected = createMemo(
    () => visibleOptions().length > 0 && visibleSelectedCount() === visibleOptions().length,
  );
  const isSomeVisibleSelected = createMemo(() => visibleSelectedCount() > 0 && !isAllVisibleSelected());
  const optionValueSet = createMemo(() => new Set(props.options.map((option) => option.value)));
  const totalSelectedCount = createMemo(() =>
    countSelectedInOptions(props.setSelection, optionValueSet(), props.options.length),
  );

  const handleSelectAllToggle = () => {
    // 検索していないときは 'all'(30 万件の配列を作らない)、検索中 / 明示の範囲のときは表示中の候補の値。
    props.onSelectAllChange(
      untrack(isSearching) || props.selectAllUsesExplicitScope
        ? untrack(visibleOptions).map((option) => option.value)
        : 'all',
      !untrack(isAllVisibleSelected),
    );
  };
  const bindSelectAllIndeterminate = createIndeterminate(isSomeVisibleSelected);
  const holdSearchInput = createHeldRef(() => props.searchInputRef);

  return (
    <>
      <input
        ref={holdSearchInput}
        type="text"
        value=""
        onInput={(event) => setSearchText(event.currentTarget.value)}
        onKeyDown={(event) => {
          // 検索欄のキーはグリッドへ流しません。
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onRequestClose();
          }
          // Enter で「検索に当たった値だけ」に置き換えて閉じます(IME の変換の確定の Enter は除く)。
          if (event.key === 'Enter') {
            if (isImeComposingKeyEvent(event)) {
              return;
            }
            event.preventDefault();
            const action = resolveSetFilterEnterAction(untrack(searchOptions), event.currentTarget.value);
            if (action.kind === 'none') {
              return;
            }
            if (action.kind === 'replace') {
              props.onReplaceSelection(action.values);
            }
            props.onRequestClose();
          }
        }}
        placeholder={texts().filterSearchPlaceholder}
        aria-label={texts().filterSearchPlaceholder}
        class="ssg-filter-input"
      />

      {/* (すべて選択): 検索中は表示中の候補だけが対象 */}
      <label class="ssg-filter-selectall">
        <input
          type="checkbox"
          ref={bindSelectAllIndeterminate}
          checked={isAllVisibleSelected()}
          onChange={controlledToggle(isSomeVisibleSelected, handleSelectAllToggle)}
        />
        <span class="ssg-filter-selectall-label">
          {isSearching() ? texts().filterSelectAllResults : texts().filterSelectAll}
        </span>
      </label>

      {/* 候補の一覧(仮想化) */}
      <div ref={(node) => (listElement = node)} class="ssg-filter-list">
        <Show
          when={visibleOptions().length > 0}
          fallback={<div class="ssg-filter-empty">{emptyListText(texts(), props.options.length, props.isServerSide)}</div>}
        >
          <div class="ssg-filter-virt" style={{ height: px(totalSize()) }}>
            <For each={virtualRows()} keyed={(row) => row.option.value}>
              {(row) => (
                <label
                  class="ssg-filter-option"
                  style={{ transform: `translateY(${row().start}px)`, height: px(row().size) }}
                >
                  <input
                    type="checkbox"
                    checked={isSetValueSelected(props.setSelection, row().option.value)}
                    onChange={controlledToggle(
                      () => false,
                      () => props.onValueToggle(untrack(row).option.value),
                    )}
                  />
                  <span class="ssg-filter-option-label">
                    {displayOptionLabel(row().option.value, row().option.label, texts().blank)}
                  </span>
                </label>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="ssg-filter-meta">
        {formatLocaleText(texts().filterSelectedCount, { selected: totalSelectedCount(), total: props.options.length })}
        {isSearching() ? formatLocaleText(texts().filterShownCount, { count: visibleOptions().length }) : ''}
        <Show when={props.truncated}>
          <TruncatedNote />
        </Show>
      </div>
    </>
  );
}

// ── 数の条件(演算子 + 値 0〜2 個。number と numberSet の条件で共用) ──
type NumberConditionEditorProps = {
  draft: NumberFilterConditionDraft;
  // 開いた後のフォーカスの先(値の入力欄の無い演算子では外れる)。
  valueInputRef: ElementHolder<HTMLInputElement>;
  onDraftChange: (draft: NumberFilterConditionDraft, options?: ConditionDraftChangeOptions) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

function NumberConditionEditor(props: NumberConditionEditorProps) {
  const texts = usePopupLocaleText();
  const operandCount = createMemo(() => numberFilterOperandCount(props.draft.operator));
  const bindOperator = createInputValue<HTMLSelectElement>(() => props.draft.operator);
  return (
    <>
      <select
        ref={bindOperator}
        onChange={(event) =>
          props.onDraftChange({ ...props.draft, operator: event.currentTarget.value as NumberFilterOperator })
        }
        onKeyDown={props.onKeyDown}
        class="ssg-filter-select"
        aria-label={texts().filterOperator}
      >
        <For each={NUMBER_FILTER_OPERATOR_OPTIONS}>
          {(option) => <option value={option.value}>{texts()[option.labelKey]}</option>}
        </For>
      </select>
      <Show when={operandCount() > 0} fallback={<div class="ssg-filter-meta">{texts().filterNoValue}</div>}>
        <div class="ssg-filter-cond-values">
          {/* type="number" ではなく text + inputmode(開いた後のフォーカスで setSelectionRange を呼ぶため)。 */}
          <ConditionValueInput
            value={() => props.draft.value1}
            inputRef={props.valueInputRef}
            inputMode="decimal"
            onChange={(value, event) => notifyDraftChange(props.onDraftChange, { ...props.draft, value1: value }, event)}
            onCommit={(value) => props.onDraftChange({ ...props.draft, value1: value })}
            onKeyDown={props.onKeyDown}
            placeholder={operandCount() === 2 ? texts().filterMin : texts().filterValuePlaceholder}
            ariaLabel={operandCount() === 2 ? texts().filterMin : texts().filterValue}
          />
          <Show when={operandCount() === 2}>
            <span class="ssg-filter-cond-tilde">{texts().filterRangeSeparator}</span>
            <ConditionValueInput
              value={() => props.draft.value2}
              inputMode="decimal"
              onChange={(value, event) => notifyDraftChange(props.onDraftChange, { ...props.draft, value2: value }, event)}
              onCommit={(value) => props.onDraftChange({ ...props.draft, value2: value })}
              onKeyDown={props.onKeyDown}
              placeholder={texts().filterMax}
              ariaLabel={texts().filterMax}
            />
          </Show>
        </div>
      </Show>
    </>
  );
}

// 条件の値の入力欄(打つたびに下書き、IME の変換の確定で確定の文字を知らせる)。
type ConditionValueInputProps = {
  value: () => string;
  inputRef?: ElementHolder<HTMLInputElement> | undefined;
  inputMode?: 'decimal' | undefined;
  onChange: (value: string, event: Event) => void;
  onCommit: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  placeholder: string;
  ariaLabel: string;
};

function ConditionValueInput(props: ConditionValueInputProps) {
  const bindValue = createInputValue<HTMLInputElement>(() => props.value());
  const holdInput = createHeldRef(() => props.inputRef);
  return (
    <input
      ref={(node) => {
        holdInput(node);
        bindValue(node);
      }}
      type="text"
      inputmode={props.inputMode}
      onInput={(event) => props.onChange(event.currentTarget.value, event)}
      // 変換の確定で、確定した文字で絞り込みます(変換中は上の onInput が保留)。
      onCompositionEnd={(event) => props.onCommit(event.currentTarget.value)}
      onKeyDown={props.onKeyDown}
      placeholder={props.placeholder}
      class="ssg-filter-input"
      aria-label={props.ariaLabel}
    />
  );
}

// ── 文字の条件(演算子 + 値 0〜1 個。textSet の条件) ──
type TextConditionEditorProps = {
  draft: TextFilterConditionDraft;
  valueInputRef: ElementHolder<HTMLInputElement>;
  onDraftChange: (draft: TextFilterConditionDraft, options?: ConditionDraftChangeOptions) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

function TextConditionEditor(props: TextConditionEditorProps) {
  const texts = usePopupLocaleText();
  const operandCount = createMemo(() => textFilterOperandCount(props.draft.operator));
  const bindOperator = createInputValue<HTMLSelectElement>(() => props.draft.operator);
  return (
    <>
      <select
        ref={bindOperator}
        onChange={(event) =>
          props.onDraftChange({ ...props.draft, operator: event.currentTarget.value as TextFilterOperator })
        }
        onKeyDown={props.onKeyDown}
        class="ssg-filter-select"
        aria-label={texts().filterOperator}
      >
        <For each={TEXT_FILTER_OPERATOR_OPTIONS}>
          {(option) => <option value={option.value}>{texts()[option.labelKey]}</option>}
        </For>
      </select>
      <Show when={operandCount() > 0} fallback={<div class="ssg-filter-meta">{texts().filterNoValue}</div>}>
        <div class="ssg-filter-cond-values">
          <ConditionValueInput
            value={() => props.draft.value}
            inputRef={props.valueInputRef}
            onChange={(value, event) => notifyDraftChange(props.onDraftChange, { ...props.draft, value }, event)}
            onCommit={(value) => props.onDraftChange({ ...props.draft, value })}
            onKeyDown={props.onKeyDown}
            placeholder={texts().filterValuePlaceholder}
            ariaLabel={texts().filterValue}
          />
        </div>
      </Show>
    </>
  );
}

// ── 日付の条件(演算子 + 日付 0〜2 個 + 相対の期間のチップ。dateSet の条件) ──
//   チップを選んでいる間は演算子と値より優先し(値の欄は出さない)、演算子や値を変えるとチップは外れます。
type DateConditionEditorProps = {
  draft: DateFilterConditionDraft;
  valueInputRef: ElementHolder<HTMLInputElement>;
  onDraftChange: (draft: DateFilterConditionDraft) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  // チップ(空ならチップの行を出さない)。
  presets: readonly NormalizedDateFilterPreset[];
  renderDateInput?: ColumnFilterDateInputRenderer | undefined;
  onRequestClose: () => void;
};

function DateConditionEditor(props: DateConditionEditorProps) {
  const texts = usePopupLocaleText();
  const operandCount = createMemo(() =>
    props.draft.preset !== null ? 0 : dateFilterOperandCount(props.draft.operator),
  );
  const bindOperator = createInputValue<HTMLSelectElement>(() => props.draft.operator);
  // 差し替えの部品からの値('YYYY-MM-DD' / '' にそろえる。チップは外す)。
  const handleSlotChange = (key: 'value1' | 'value2', value: string | Date | null) => {
    props.onDraftChange({ ...props.draft, [key]: normalizeFilterDateInputValue(value), preset: null });
  };
  // 差し替えの部品は、範囲 / 1 つの区別が変わったときだけ作り直します(値と名前は ctx のゲッターで読む)。
  const renderSlot = (slot: 'single' | 'from' | 'to'): JSX.Element => {
    const render = props.renderDateInput;
    if (!render) {
      return null;
    }
    const key = slot === 'to' ? 'value2' : 'value1';
    return untrack(() =>
      render({
        get value() {
          return props.draft[key];
        },
        onChange: (value) => handleSlotChange(key, value),
        get ariaLabel() {
          return slot === 'from' ? texts().filterStartDate : slot === 'to' ? texts().filterEndDate : texts().filterDate;
        },
        slot,
      }),
    );
  };
  const firstSlot = createMemo(() => (operandCount() === 2 ? 'from' : 'single'));
  const togglePreset = (id: string) => {
    props.onDraftChange({ ...props.draft, preset: props.draft.preset === id ? null : id });
  };
  return (
    <>
      <select
        ref={bindOperator}
        onChange={(event) =>
          props.onDraftChange({
            ...props.draft,
            operator: event.currentTarget.value as DateFilterOperator,
            preset: null,
          })
        }
        onKeyDown={props.onKeyDown}
        class="ssg-filter-select"
        aria-label={texts().filterOperator}
      >
        <For each={DATE_FILTER_OPERATOR_OPTIONS}>
          {(option) => <option value={option.value}>{texts()[option.labelKey]}</option>}
        </For>
      </select>
      <Show
        when={operandCount() > 0}
        fallback={
          <Show when={props.draft.preset === null}>
            <div class="ssg-filter-meta">{texts().filterNoValue}</div>
          </Show>
        }
      >
        <div class="ssg-filter-cond-values">
          <Show
            when={props.renderDateInput}
            fallback={
              <FilterDateField
                value={props.draft.value1}
                onCommit={(value) => props.onDraftChange({ ...props.draft, value1: value, preset: null })}
                ariaLabel={operandCount() === 2 ? texts().filterStartDate : texts().filterDate}
                inputRef={props.valueInputRef}
                onRequestClose={props.onRequestClose}
              />
            }
          >
            {(() => {
              const slot = firstSlot();
              return untrack(() => renderSlot(slot));
            })()}
          </Show>
          <Show when={operandCount() === 2}>
            <span class="ssg-filter-cond-tilde">{texts().filterRangeSeparator}</span>
            <Show
              when={props.renderDateInput}
              fallback={
                <FilterDateField
                  value={props.draft.value2}
                  onCommit={(value) => props.onDraftChange({ ...props.draft, value2: value, preset: null })}
                  ariaLabel={texts().filterEndDate}
                  onRequestClose={props.onRequestClose}
                  align="right"
                />
              }
            >
              {untrack(() => renderSlot('to'))}
            </Show>
          </Show>
        </div>
      </Show>
      {/* チップは列の構成(dateFilterPresets)から。空の構成ではチップの行ごと出しません。 */}
      <Show when={props.presets.length > 0}>
        <div class="ssg-filter-presets">
          {/* id で使い回します(押した直後にチップの要素が作り直されるとフォーカスが外れる。React 版の key と同じ)。 */}
          <For each={props.presets} keyed={(option) => option.id}>
            {(option) => (
              <button
                type="button"
                {...pressHandlers(() => togglePreset(option().id))}
                class={['ssg-filter-preset-chip', { 'ssg-filter-preset-chip--active': props.draft.preset === option().id }]}
              >
                {option().label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

// ── dateSet の値(年 / 月 / 日の木。検索中は平らな一覧) ──
type DateSetFilterBodyProps = {
  // そろえた日付のキーの候補(条件で絞った後)。
  options: ColumnFilterPopoverOption[];
  setSelection: ColumnFilterSetSelection | null;
  searchInputRef: ElementHolder<HTMLInputElement>;
  onValueToggle: (value: string) => void;
  onSelectAllChange: (scope: 'all' | string[], nextSelected: boolean) => void;
  onReplaceSelection: (values: string[]) => void;
  onRequestClose: () => void;
  isServerSide: boolean;
  truncated?: boolean | undefined;
};

function DateSetFilterBody(props: DateSetFilterBodyProps) {
  const texts = usePopupLocaleText();
  const [searchText, setSearchText] = createSignal('');
  // 開いている年 / 月のキー(最初はすべて畳む = 年だけ)。
  const [expandedKeys, setExpandedKeys] = createSignal<ReadonlySet<string>>(new Set<string>());
  const isSearching = createMemo(() => searchText().trim().length > 0);
  const searchOptions = createMemo(() => withDisplayBlankLabel(props.options, texts().blank));
  const flatMatches = createMemo(() => filterSetOptionsBySearch(searchOptions(), searchText()));
  const treeRows = createMemo(() => buildDateTreeRows(props.options, expandedKeys(), texts()));

  let listElement: HTMLDivElement | undefined;
  const rowCount = createMemo(() => (isSearching() ? flatMatches().length : treeRows().length));
  const optionRowHeight = resolveSetFilterOptionRowHeight();
  const virtualizer = createColumnVirtualizer<HTMLDivElement>(() => ({
    count: rowCount(),
    getScrollElement: () => listElement ?? null,
    estimateSize: () => optionRowHeight,
    overscan: 10,
  }));
  const totalSize = createMemo(() => {
    virtualizer.items();
    return virtualizer.instance.getTotalSize();
  });
  const flatVirtualRows = createMemo(() => {
    if (!isSearching()) {
      return [];
    }
    const options = flatMatches();
    return virtualizer.items().flatMap((item) => {
      const option = options[item.index];
      return option ? [{ option, start: item.start, size: item.size }] : [];
    });
  });
  const treeVirtualRows = createMemo(() => {
    if (isSearching()) {
      return [];
    }
    const rows = treeRows();
    return virtualizer.items().flatMap((item) => {
      const row = rows[item.index];
      return row ? [{ row, start: item.start, size: item.size }] : [];
    });
  });

  // (すべて選択)の 3 つの状態(対象 = 検索中は当たった日 / 検索していないときはすべての日)。
  const selectAllScopeValues = createMemo(() =>
    (isSearching() ? flatMatches() : props.options).map((option) => option.value),
  );
  const selectAllSelectedCount = createMemo(() => {
    let count = 0;
    for (const value of selectAllScopeValues()) {
      if (isSetValueSelected(props.setSelection, value)) {
        count += 1;
      }
    }
    return count;
  });
  const isAllVisibleSelected = createMemo(
    () => selectAllScopeValues().length > 0 && selectAllSelectedCount() === selectAllScopeValues().length,
  );
  const isSomeVisibleSelected = createMemo(() => selectAllSelectedCount() > 0 && !isAllVisibleSelected());
  const optionValueSet = createMemo(() => new Set(props.options.map((option) => option.value)));
  const totalSelectedCount = createMemo(() =>
    countSelectedInOptions(props.setSelection, optionValueSet(), props.options.length),
  );

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const countSelectedLeaves = (leafKeys: string[], selection: ColumnFilterSetSelection | null): number => {
    let count = 0;
    for (const key of leafKeys) {
      if (isSetValueSelected(selection, key)) {
        count += 1;
      }
    }
    return count;
  };
  // 木の行のチェックの切り替え(チェックボックスと、行の文字 / 余白のクリックで共通)。日はその値、年 / 月は配下の日をまとめて
  //   (すべて選ばれていれば外し、それ以外はすべて選ぶ)。
  const toggleTreeRow = (row: DateTreeRow) => {
    if (row.type === 'leaf') {
      props.onValueToggle(row.key);
      return;
    }
    const selection = untrack(() => props.setSelection);
    const checked = row.leafKeys.length > 0 && countSelectedLeaves(row.leafKeys, selection) === row.leafKeys.length;
    props.onSelectAllChange(row.leafKeys, !checked);
  };
  const bindSelectAllIndeterminate = createIndeterminate(isSomeVisibleSelected);
  const holdSearchInput = createHeldRef(() => props.searchInputRef);

  // 木の 1 行(年 / 月は開閉のボタン + 3 つの状態のチェック、日はチェック)。
  const TreeRowContent = (rowProps: { row: () => DateTreeRow }) => {
    const selectedLeafCount = createMemo(() => countSelectedLeaves(rowProps.row().leafKeys, props.setSelection));
    const isChecked = createMemo(
      () => rowProps.row().leafKeys.length > 0 && selectedLeafCount() === rowProps.row().leafKeys.length,
    );
    const isIndeterminate = createMemo(() => selectedLeafCount() > 0 && !isChecked());
    const bindIndeterminate = createIndeterminate(isIndeterminate);
    const label = () => displayOptionLabel(rowProps.row().key, rowProps.row().label, texts().blank);
    return (
      <>
        <Show
          when={rowProps.row().type === 'group'}
          fallback={<span class="ssg-filter-tree-toggle ssg-filter-tree-toggle--placeholder" />}
        >
          <button
            type="button"
            {...pressHandlers(() => toggleExpanded(untrack(rowProps.row).key))}
            class="ssg-filter-tree-toggle"
            aria-label={rowProps.row().expanded ? texts().treeCollapse : texts().treeExpand}
          >
            {rowProps.row().expanded ? '▾' : '▸'}
          </button>
        </Show>
        <input
          type="checkbox"
          ref={bindIndeterminate}
          checked={isChecked()}
          // 木の行は label で包まない(開閉のボタンを含む)ので、名前を付けます。
          aria-label={label()}
          onChange={controlledToggle(isIndeterminate, () => toggleTreeRow(untrack(rowProps.row)))}
        />
        <span class="ssg-filter-option-label">{label()}</span>
      </>
    );
  };

  return (
    <>
      <input
        ref={holdSearchInput}
        type="text"
        value=""
        onInput={(event) => setSearchText(event.currentTarget.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onRequestClose();
          }
          // 検索の Enter(set の一覧と同じ。IME の変換の確定は除く)。
          if (event.key === 'Enter') {
            if (isImeComposingKeyEvent(event)) {
              return;
            }
            event.preventDefault();
            const action = resolveSetFilterEnterAction(untrack(searchOptions), event.currentTarget.value);
            if (action.kind === 'none') {
              return;
            }
            if (action.kind === 'replace') {
              props.onReplaceSelection(action.values);
            }
            props.onRequestClose();
          }
        }}
        placeholder={texts().filterSearchPlaceholder}
        aria-label={texts().filterSearchPlaceholder}
        class="ssg-filter-input"
      />

      <label class="ssg-filter-selectall">
        <input
          type="checkbox"
          ref={bindSelectAllIndeterminate}
          checked={isAllVisibleSelected()}
          onChange={controlledToggle(isSomeVisibleSelected, () =>
            props.onSelectAllChange(untrack(selectAllScopeValues), !untrack(isAllVisibleSelected)),
          )}
        />
        <span class="ssg-filter-selectall-label">
          {isSearching() ? texts().filterSelectAllResults : texts().filterSelectAll}
        </span>
      </label>

      <div ref={(node) => (listElement = node)} class="ssg-filter-list">
        <Show
          when={rowCount() > 0}
          fallback={<div class="ssg-filter-empty">{emptyListText(texts(), props.options.length, props.isServerSide)}</div>}
        >
          <div class="ssg-filter-virt" style={{ height: px(totalSize()) }}>
            <For each={flatVirtualRows()} keyed={(item) => item.option.value}>
              {(item) => (
                <label
                  class="ssg-filter-option"
                  style={{ transform: `translateY(${item().start}px)`, height: px(item().size) }}
                >
                  <input
                    type="checkbox"
                    checked={isSetValueSelected(props.setSelection, item().option.value)}
                    onChange={controlledToggle(
                      () => false,
                      () => props.onValueToggle(untrack(item).option.value),
                    )}
                  />
                  <span class="ssg-filter-option-label">
                    {displayOptionLabel(item().option.value, item().option.label, texts().blank)}
                  </span>
                </label>
              )}
            </For>
            <For each={treeVirtualRows()} keyed={(item) => item.row.key}>
              {(item) => (
                // 行の文字や余白を押してもチェックを切り替えます(開閉のボタンとチェックボックスそのものは除く)。
                <div
                  class="ssg-filter-option"
                  style={{
                    transform: `translateY(${item().start}px)`,
                    height: px(item().size),
                    'padding-left': px(8 + item().row.depth * 16),
                  }}
                  onClick={(event) => {
                    const target = event.target as Element;
                    if (target.closest('button, input')) {
                      return;
                    }
                    toggleTreeRow(untrack(item).row);
                  }}
                >
                  <TreeRowContent row={() => item().row} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="ssg-filter-meta">
        {formatLocaleText(texts().filterSelectedCount, { selected: totalSelectedCount(), total: props.options.length })}
        {isSearching() ? formatLocaleText(texts().filterShownCount, { count: flatMatches().length }) : ''}
        <Show when={props.truncated}>
          <TruncatedNote />
        </Show>
      </div>
    </>
  );
}

// 候補の取得中 / 失敗(一覧の位置に出す。失敗のときは「再試行」で同じ列を取り直す)。
function OptionsPendingBody(props: {
  status: 'loading' | 'error';
  errorMessage?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const texts = usePopupLocaleText();
  return (
    <Show
      when={props.status === 'error'}
      fallback={<div class="ssg-filter-collecting">{texts().filterOptionsLoading}</div>}
    >
      <div class="ssg-filter-error" role="alert">
        <div>{texts().filterOptionsFailed}</div>
        <Show when={props.errorMessage}>
          {(message) => (
            <div class="ssg-filter-error-detail" title={message()}>
              {message()}
            </div>
          )}
        </Show>
        <Show when={props.onRetry}>
          {(retry) => (
            <button type="button" {...pressHandlers(() => retry()())} class="ssg-filter-btn-secondary">
              {texts().retry}
            </button>
          )}
        </Show>
      </div>
    </Show>
  );
}

// ── select の列(候補の select。適用 / Enter で確定) ──
function SelectFilterField(props: {
  draftValue: string;
  options: ColumnFilterPopoverOption[];
  selectRef: ElementHolder<HTMLSelectElement>;
  truncated?: boolean | undefined;
  onDraftChange: (value: string) => void;
  onApply: () => void;
  onRequestClose: () => void;
}) {
  const texts = usePopupLocaleText();
  const bindValue = createInputValue<HTMLSelectElement>(() => props.draftValue);
  const holdSelect = createHeldRef(() => props.selectRef);
  return (
    <>
      <select
        ref={(node) => {
          holdSelect(node);
          bindValue(node);
        }}
        onChange={(event) => props.onDraftChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          // select の中のキーはグリッドへ流しません。
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onApply();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onRequestClose();
          }
        }}
        class="ssg-filter-select"
      >
        <option value="">{texts().filterAll}</option>
        <For each={props.options}>
          {(option) => <option value={option.value}>{displayOptionLabel(option.value, option.label, texts().blank)}</option>}
        </For>
      </select>
      <div class="ssg-filter-meta">
        {formatLocaleText(texts().filterOptionCount, { count: props.options.length })}
        <Show when={props.truncated}>
          <TruncatedNote />
        </Show>
      </div>
    </>
  );
}

// ── text / date / custom の列(部分一致の文字。適用 / Enter で確定) ──
function TextFilterField(props: {
  draftValue: string;
  textInputRef: ElementHolder<HTMLInputElement>;
  onDraftChange: (value: string) => void;
  onApply: () => void;
  onRequestClose: () => void;
}) {
  const texts = usePopupLocaleText();
  const bindValue = createInputValue<HTMLInputElement>(() => props.draftValue);
  const holdInput = createHeldRef(() => props.textInputRef);
  return (
    <>
      <input
        ref={(node) => {
          holdInput(node);
          bindValue(node);
        }}
        type="text"
        onInput={(event) => props.onDraftChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          // 入力欄のキーはグリッドへ流しません(IME の変換中の Enter / Escape は変換の操作)。
          event.stopPropagation();
          if (isImeComposingKeyEvent(event)) {
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onApply();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onRequestClose();
          }
        }}
        placeholder={texts().filterTextPlaceholder}
        aria-label={texts().filterTextPlaceholder}
        class="ssg-filter-input"
      />
      <div class="ssg-filter-meta ssg-filter-meta--ellipsis">{texts().filterTextHint}</div>
    </>
  );
}

// ── 条件と値の組み合わせ(numberSet / textSet / dateSet)の共通の並び ──
//   条件の見出し + 条件 + 区切り + 値の見出し + 値の一覧 + 要約。条件の欄と値の一覧は種別ごとに違うので受け取ります。
type ComboFilterLayoutProps = {
  conditionEditor: JSX.Element;
  conditionActive: boolean;
  onConditionClear: () => void;
  // 条件で絞った後の候補(条件があるときは「一致 n 件」、無いときは「全 n 件」)。
  options: ColumnFilterPopoverOption[];
  setSelection: ColumnFilterSetSelection | null;
  onSelectionClear: () => void;
  summaryText: string;
  children: JSX.Element;
  // 候補を集めている / 取っている / 失敗したときの、件数の代わりの文言。
  optionsMeta?: string | undefined;
};

function ComboFilterLayout(props: ComboFilterLayoutProps) {
  const texts = usePopupLocaleText();
  return (
    <>
      <div class="ssg-filter-sec-head">
        <span class="ssg-filter-sec-label">{texts().filterConditionSection}</span>
        <button
          type="button"
          {...pressHandlers(() => props.onConditionClear())}
          class="ssg-filter-sec-clear"
          disabled={!props.conditionActive}
        >
          {texts().clear}
        </button>
      </div>
      {props.conditionEditor}
      <div class="ssg-filter-sep" />
      <div class="ssg-filter-sec-head">
        <span class="ssg-filter-sec-label">{texts().filterValuesSection}</span>
        <span class="ssg-filter-sec-meta">
          {props.optionsMeta ??
            formatLocaleText(props.conditionActive ? texts().filterMatchCount : texts().filterTotalCount, {
              count: props.options.length,
            })}
        </span>
        <button
          type="button"
          {...pressHandlers(() => props.onSelectionClear())}
          class="ssg-filter-sec-clear"
          disabled={props.setSelection === null}
        >
          {texts().clear}
        </button>
      </div>
      {props.children}
      <div class="ssg-filter-summary">🔽 {props.summaryText}</div>
    </>
  );
}

export type ColumnFilterPopoverProps = {
  themeClassName?: string | undefined;
  popoverSlot?: GridResolvedSlot | undefined;
  title: string;
  // 'auto' を解決した後の種別。
  filterType: ColumnFilterUiType;
  draftValue: string;
  // number / numberSet の条件の下書き(ほかは null)。
  numberConditionDraft: NumberFilterConditionDraft | null;
  onNumberConditionDraftChange: (draft: NumberFilterConditionDraft, options?: ConditionDraftChangeOptions) => void;
  textConditionDraft: TextFilterConditionDraft | null;
  onTextConditionDraftChange: (draft: TextFilterConditionDraft, options?: ConditionDraftChangeOptions) => void;
  dateConditionDraft: DateFilterConditionDraft | null;
  onDateConditionDraftChange: (draft: DateFilterConditionDraft) => void;
  // dateSet のチップの構成(未指定は組み込みの 3 つ)。
  datePresets?: readonly NormalizedDateFilterPreset[] | undefined;
  renderDateInput?: ColumnFilterDateInputRenderer | undefined;
  // 組み合わせの列の、条件だけ / 値だけのクリア(下の「クリア」はすべて)。
  onComboConditionClear: () => void;
  onComboSelectionClear: () => void;
  comboSummaryText: string;
  currentValueText: string;
  layout: FilterPopoverLayout;
  selectOptions: ColumnFilterPopoverOption[];
  optionsStatus: ColumnSelectOptionsStatus;
  optionsProgress: number;
  optionsTruncated?: boolean | undefined;
  optionsErrorMessage?: string | undefined;
  onOptionsRetry?: (() => void) | undefined;
  setSelection: ColumnFilterSetSelection | null;
  // パネル / 開いた後のフォーカスの先(コントローラ)。
  setPanel: (element: HTMLDivElement) => void;
  panelRef: ElementHolder<HTMLDivElement>;
  textInputRef: ElementHolder<HTMLInputElement>;
  selectRef: ElementHolder<HTMLSelectElement>;
  onRequestClose: () => void;
  onDraftChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  onSetValueToggle: (value: string) => void;
  onSetSelectAllChange: (scope: 'all' | string[], nextSelected: boolean) => void;
  onSetClear: () => void;
  onSetReplaceSelection: (values: string[]) => void;
  // serverSide では候補を表から集められないので、候補が空のときの文言を変えます。
  isServerSide?: boolean | undefined;
};

export function ColumnFilterPopover(props: ColumnFilterPopoverProps) {
  const texts = usePopupLocaleText();
  const portal = useGridPortal();
  // 描く場所は開いたときに 1 回決めます。
  const container = portal.container();
  // 組み合わせの列の値の一覧の検索欄(開いた後のフォーカスの先は条件の値の欄なので別に持つ)。
  const comboSearchInputRef: ElementHolder<HTMLInputElement> = { current: null };
  // 相対の期間のチップで候補を絞るときの基準の時刻(開いたときに 1 回。行の絞り込みは評価のたびに解決する)。
  const comboNow = new Date();
  const [panel, setPanel] = createSignal<HTMLDivElement>();
  let panelNode: HTMLDivElement | undefined;
  onCleanup(() => {
    panelNode?.removeEventListener('keydown', handleKeyDownCapture, true);
    if (props.panelRef.current === panelNode) {
      props.panelRef.current = null;
    }
  });
  const layout = createMemo(() => props.layout);
  // 表で決まったトークン(--ssg-*)をポップオーバーへ写し、位置が変わるたびに描く場所のずれを打ち消します。
  createPortalTokens(panel, () => props.themeClassName, layout);

  const filterType = createMemo(() => props.filterType);
  const isSetFilter = createMemo(() => filterType() === 'set');
  const isNumberSetFilter = createMemo(() => filterType() === 'numberSet');
  const isTextSetFilter = createMemo(() => filterType() === 'textSet');
  const isDateSetFilter = createMemo(() => filterType() === 'dateSet');
  const isComboFilter = createMemo(() => isNumberSetFilter() || isTextSetFilter() || isDateSetFilter());
  // set / 組み合わせは押したらすぐ反映(適用のボタンなし・下はクリア + 閉じる・今の値の行なし)。
  const isImmediateFilter = createMemo(() => isSetFilter() || isComboFilter());
  const usesOptions = createMemo(() => isImmediateFilter() || filterType() === 'select');
  // 候補の状態('collecting' = 表から集めている / 'pending' = getFilterOptions で取っている・失敗 / 'ready')。
  const optionsPhase = createMemo<'collecting' | 'pending' | 'ready'>(() => {
    if (!usesOptions()) {
      return 'ready';
    }
    const status = props.optionsStatus;
    return status === 'collecting' ? 'collecting' : status === 'loading' || status === 'error' ? 'pending' : 'ready';
  });
  const pendingStatus = createMemo(() => (props.optionsStatus === 'loading' ? 'loading' : 'error'));

  const numberDraft = createMemo(() => props.numberConditionDraft ?? DEFAULT_NUMBER_FILTER_DRAFT);
  const textDraft = createMemo(() => props.textConditionDraft ?? DEFAULT_TEXT_FILTER_DRAFT);
  const dateDraft = createMemo(() => props.dateConditionDraft ?? DEFAULT_DATE_FILTER_DRAFT);
  const resolvedDatePresets = createMemo(() => props.datePresets ?? normalizeDateFilterPresets(undefined, texts()));

  // 条件の下書きから条件を作り、値の候補を条件に当たる値だけに絞ります(条件が無ければ同じ配列のまま)。
  const numberComboCondition = createMemo(() => (isNumberSetFilter() ? buildParsedNumberFilterFromDraft(numberDraft()) : null));
  const textComboCondition = createMemo(() => (isTextSetFilter() ? buildParsedTextFilterFromDraft(textDraft()) : null));
  const dateComboCondition = createMemo(() => (isDateSetFilter() ? buildParsedDateFilterFromDraft(dateDraft()) : null));
  const comboConditionActive = createMemo(
    () => numberComboCondition() !== null || textComboCondition() !== null || dateComboCondition() !== null,
  );
  const comboOptions = createMemo(() =>
    isNumberSetFilter()
      ? filterOptionsByNumberCondition(props.selectOptions, numberComboCondition())
      : isTextSetFilter()
        ? filterOptionsByTextCondition(props.selectOptions, textComboCondition())
        : isDateSetFilter()
          ? filterOptionsByDateCondition(props.selectOptions, dateComboCondition(), comboNow, resolvedDatePresets())
          : props.selectOptions,
  );
  const comboOptionsMeta = createMemo(() => {
    const phase = optionsPhase();
    if (phase === 'collecting') {
      return texts().filterOptionsLoadingShort;
    }
    if (phase === 'pending') {
      return pendingStatus() === 'loading' ? texts().filterOptionsLoadingShort : texts().filterOptionsFailedShort;
    }
    return undefined;
  });
  const collectingText = () =>
    formatLocaleText(texts().filterCollecting, { percent: Math.round(props.optionsProgress * 100) });

  // 条件の欄(演算子 / 値)のキー: Enter = 適用、Escape = 閉じる(IME の変換中は除く)。
  const handleConditionKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (isImeComposingKeyEvent(event)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onApply();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onRequestClose();
    }
  };

  // パネルのキー: グリッドへ流さず、パネルのどこにフォーカスがあっても Escape で閉じます(中の部品が扱った Escape と IME の
  //   変換中は除く)。
  const handleKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !isEscapePreventedInside(event) && !isImeComposingKeyEvent(event)) {
      event.preventDefault();
      props.onRequestClose();
    }
  };
  // Tab はパネルの中で回します(最後の次は先頭、先頭の前は最後)。中の入力欄やボタンはキーの伝播を止めるので capture 相で見ます。
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (readEventKey(event) !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || isImeComposingKeyEvent(event)) {
      return;
    }
    const current = event.currentTarget as HTMLElement;
    const next = resolveFocusWrapTarget(current, event.target instanceof Element ? event.target : null, event.shiftKey);
    if (next !== null) {
      event.preventDefault();
      next.focus();
    }
  };

  const comboConditionEditor = (): JSX.Element => (
    <Switch>
      <Match when={isNumberSetFilter()}>
        <NumberConditionEditor
          draft={numberDraft()}
          valueInputRef={props.textInputRef}
          onDraftChange={props.onNumberConditionDraftChange}
          onKeyDown={handleConditionKeyDown}
        />
      </Match>
      <Match when={isTextSetFilter()}>
        <TextConditionEditor
          draft={textDraft()}
          valueInputRef={props.textInputRef}
          onDraftChange={props.onTextConditionDraftChange}
          onKeyDown={handleConditionKeyDown}
        />
      </Match>
      <Match when={isDateSetFilter()}>
        <DateConditionEditor
          draft={dateDraft()}
          valueInputRef={props.textInputRef}
          onDraftChange={props.onDateConditionDraftChange}
          onKeyDown={handleConditionKeyDown}
          presets={resolvedDatePresets()}
          renderDateInput={props.renderDateInput}
          onRequestClose={props.onRequestClose}
        />
      </Match>
    </Switch>
  );

  const body = (): JSX.Element => (
    <Switch>
      <Match when={isComboFilter()}>
        {/* 条件と値の組み合わせ: 候補を集めている / 取っている間も条件の欄はそのまま使える(条件は候補に依らない)。 */}
        <ComboFilterLayout
          conditionEditor={comboConditionEditor()}
          conditionActive={comboConditionActive()}
          onConditionClear={props.onComboConditionClear}
          options={comboOptions()}
          setSelection={props.setSelection}
          onSelectionClear={props.onComboSelectionClear}
          summaryText={props.comboSummaryText}
          optionsMeta={comboOptionsMeta()}
        >
          <Switch>
            <Match when={optionsPhase() === 'collecting'}>
              <div class="ssg-filter-collecting">{collectingText()}</div>
            </Match>
            <Match when={optionsPhase() === 'pending'}>
              <OptionsPendingBody
                status={pendingStatus()}
                errorMessage={props.optionsErrorMessage}
                onRetry={props.onOptionsRetry}
              />
            </Match>
            <Match when={isDateSetFilter()}>
              <DateSetFilterBody
                options={comboOptions()}
                setSelection={props.setSelection}
                searchInputRef={comboSearchInputRef}
                onValueToggle={props.onSetValueToggle}
                onSelectAllChange={props.onSetSelectAllChange}
                onReplaceSelection={props.onSetReplaceSelection}
                onRequestClose={props.onRequestClose}
                isServerSide={props.isServerSide ?? false}
                truncated={props.optionsTruncated}
              />
            </Match>
            <Match when={true}>
              <SetFilterBody
                options={comboOptions()}
                setSelection={props.setSelection}
                searchInputRef={comboSearchInputRef}
                onValueToggle={props.onSetValueToggle}
                onSelectAllChange={props.onSetSelectAllChange}
                onReplaceSelection={props.onSetReplaceSelection}
                onRequestClose={props.onRequestClose}
                isServerSide={props.isServerSide ?? false}
                selectAllUsesExplicitScope
                truncated={props.optionsTruncated}
              />
            </Match>
          </Switch>
        </ComboFilterLayout>
      </Match>
      <Match when={optionsPhase() === 'collecting'}>
        {/* 大きな表の候補を集めている間(全体が決まるまで一覧は出さない)。 */}
        <div class="ssg-filter-collecting">{collectingText()}</div>
      </Match>
      <Match when={optionsPhase() === 'pending'}>
        <OptionsPendingBody
          status={pendingStatus()}
          errorMessage={props.optionsErrorMessage}
          onRetry={props.onOptionsRetry}
        />
      </Match>
      <Match when={isSetFilter()}>
        <SetFilterBody
          options={props.selectOptions}
          setSelection={props.setSelection}
          searchInputRef={props.textInputRef}
          onValueToggle={props.onSetValueToggle}
          onSelectAllChange={props.onSetSelectAllChange}
          onReplaceSelection={props.onSetReplaceSelection}
          onRequestClose={props.onRequestClose}
          isServerSide={props.isServerSide ?? false}
          truncated={props.optionsTruncated}
        />
      </Match>
      <Match when={filterType() === 'number'}>
        <NumberConditionEditor
          draft={numberDraft()}
          valueInputRef={props.textInputRef}
          onDraftChange={props.onNumberConditionDraftChange}
          onKeyDown={handleConditionKeyDown}
        />
      </Match>
      <Match when={filterType() === 'select'}>
        <SelectFilterField
          draftValue={props.draftValue}
          options={props.selectOptions}
          selectRef={props.selectRef}
          truncated={props.optionsTruncated}
          onDraftChange={props.onDraftChange}
          onApply={props.onApply}
          onRequestClose={props.onRequestClose}
        />
      </Match>
      <Match when={true}>
        {/* text / date / custom の部分一致の文字。 */}
        <TextFilterField
          draftValue={props.draftValue}
          textInputRef={props.textInputRef}
          onDraftChange={props.onDraftChange}
          onApply={props.onApply}
          onRequestClose={props.onRequestClose}
        />
      </Match>
    </Switch>
  );

  const titleText = () => formatLocaleText(texts().filterTitle, { column: props.title });
  const panelStyle = (): JSX.CSSProperties => ({
    ...props.popoverSlot?.style,
    top: px(layout().top),
    left: px(layout().left),
    width: px(layout().width),
    'max-height': px(layout().maxHeight),
  });

  return (
    <Show when={container}>
      {(mount) => (
        <Portal mount={mount()}>
          <div
            ref={(node) => {
              panelNode = node;
              setPanel(node);
              props.setPanel(node);
              node.addEventListener('keydown', handleKeyDownCapture, true);
            }}
            // パネルの中のポインタの操作をグリッドへ伝えません。
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            class={['ssg-filter-popover', props.themeClassName, props.popoverSlot?.className]}
            style={panelStyle()}
            // 支援技術にダイアログとして伝え、見出しと同じ名前を付けます(モーダルではないので aria-modal は付けない)。
            role="dialog"
            aria-label={titleText()}
            // タッチの端末では開いたときのフォーカスを入力欄ではなくここへ置きます(コントローラ)。
            tabindex={-1}
          >
            <div class="ssg-filter-title">{titleText()}</div>

            {body()}

            {/* set / 組み合わせは押したらすぐ反映なので、今の値の行を出しません(件数は一覧の下)。 */}
            <Show when={!isImmediateFilter()}>
              <div class="ssg-filter-meta ssg-filter-meta--ellipsis">
                {formatLocaleText(texts().filterCurrentValue, { value: props.currentValueText })}
              </div>
            </Show>

            <div class="ssg-filter-footer">
              <Show
                when={isImmediateFilter()}
                fallback={
                  <>
                    <button type="button" {...pressHandlers(() => props.onClear())} class="ssg-filter-btn-secondary">
                      {texts().clear}
                    </button>
                    <button type="button" {...pressHandlers(() => props.onApply())} class="ssg-filter-btn-primary">
                      {texts().apply}
                    </button>
                  </>
                }
              >
                {/* クリアは閉じずにすべて選択へ戻し、閉じるで終わる。 */}
                <button type="button" {...pressHandlers(() => props.onSetClear())} class="ssg-filter-btn-secondary">
                  {texts().clear}
                </button>
                <button type="button" {...pressHandlers(() => props.onRequestClose())} class="ssg-filter-btn-primary">
                  {texts().close}
                </button>
              </Show>
            </div>
          </div>
        </Portal>
      )}
    </Show>
  );
}