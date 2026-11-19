// 列フィルターのポップオーバーの中身の用意と描画(機能 features/filtering の部品)。React 版の features/filtering.tsx の
//   useFilterPopoverContent にあたるものです。
//   - 候補: 列の filterOptions > getFilterOptions(取っている間 / 失敗の表示、再試行)> 表の行から集める(5 万行を超える表は
//     時間分割。core controllers/selectOptionsCollector)。開いている間は、開いたときの行から集めた候補のまま固定します
//     (行がよく変わる表で一覧の並びが動かないように。開いたときに行が空だったら、行が来た時点で固定)。
//   - 派生値(dateSet の日付のキーへのまとめ直し・選ばれている値)とコマンド(チェック・すべて選択・検索の確定・条件の編集・
//     適用・クリア)は core の engine/filterPopoverCommands。
//   シェルにいつも置き(閉じている間は何も描かない)、集めた候補の控えを開き直したときに使います(React 版と同じ)。
import { Show, createMemo } from 'solid-js';
import {
  createFilterPopoverCommands,
  createFilterPopoverDerivedResolver,
} from '@ishibashi0112/spreadsheet-grid-core/internal/engine/filterPopoverCommands';
import {
  createSelectOptionsCollector,
  isSelectLikeFilterType,
  resolveSyncSelectOptions,
  selectCollectorResult,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectOptionsCollector';
import {
  createAsyncSelectOptionsSource,
  selectAsyncOptionsResult,
  type AsyncSelectOptionsFetch,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/asyncSelectOptionsSource';
import {
  columnFilterValueToDraftText,
  isActiveColumnFilterValue,
  isNumberColumnFilterValue,
  isSetColumnFilterValue,
  toDateSetKey,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import {
  createColumnFilterDescribeOptions,
  describeColumnFilterValue,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filterSummary';
import { normalizeDateFilterPresets } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/dateFilterPresets';
import { formatLocaleText, type FeatureLocaleText, type ResolvedGridLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { DEFAULT_FILTERING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridActions';
import type { ColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlot } from '../model/gridTypes';
import { connectController } from '../primitives/controller';
import { createExternalStoreSignal } from '../primitives/externalStore';
import type { FilterPopover } from '../primitives/filterPopover';
import { ColumnFilterPopover, type ColumnFilterDateInputRenderer } from './ColumnFilterPopover';
import type { FilterDateInputContext } from '@ishibashi0112/spreadsheet-grid-core';
import type { JSX } from '@solidjs/web';

type FilteringTexts = FeatureLocaleText<typeof DEFAULT_FILTERING_LOCALE_TEXT>;

export type ColumnFilterPopoverHostProps<T> = {
  filterPopover: FilterPopover<T>;
  // 候補を集める行(ラベル行を除いたデータの行)。
  rows: T[];
  columnFilters: Record<string, ColumnFilterValue>;
  globalFilterText: string;
  getFilterOptions?: AsyncSelectOptionsFetch<T> | undefined;
  isServerSide: boolean;
  dispatch: (action: GridUiAction) => void;
  renderFilterDateInput?: ((ctx: FilterDateInputContext) => JSX.Element) | undefined;
  popoverSlot?: GridResolvedSlot | undefined;
  themeClassName?: string | undefined;
  localeTexts: ResolvedGridLocaleText;
};

export function ColumnFilterPopoverHost<T>(props: ColumnFilterPopoverHostProps<T>) {
  const filterPopover = props.filterPopover;
  const openedColumn = filterPopover.openedColumn;
  const openedType = filterPopover.openedFilterType;
  const openedOptionsKey = createMemo(() => {
    const column = openedColumn();
    return column ? String(column.key) : null;
  });
  // 開いている間の候補の行(開いたときの行。開いたときに空だったら、行が来た時点の行)。閉じている間は今の行。
  const optionRowsHold = createMemo<{ key: string | null; rows: readonly T[] }>((prev) => {
    const key = openedOptionsKey();
    const rows = props.rows;
    if (key === null) {
      return prev !== undefined && prev.key === null && prev.rows === rows ? prev : { key: null, rows };
    }
    if (prev === undefined || prev.key !== key || (prev.rows.length === 0 && rows.length > 0)) {
      return { key, rows };
    }
    return prev;
  });
  const optionRows = createMemo(() => optionRowsHold().rows);
  const openedIsDateSet = createMemo(() => openedType() === 'dateSet');
  // 開いている列のセルの値(dateSet は照らし合わせと同じ日付のキー)。行 / 列が変わったときだけ作り直す = 集め直しの合図。
  const getOpenedColumnRawValueAt = createMemo(() => {
    const rows = optionRows();
    const column = openedColumn();
    const isDateSet = openedIsDateSet();
    return (index: number): unknown => {
      if (!column) {
        return undefined;
      }
      const value = getCellValue(rows[index], column);
      return isDateSet ? toDateSetKey(value) : value;
    };
  });

  // getFilterOptions の対象の列か(列の filterOptions が優先。候補を使わない種別は対象外)。
  const usesAsyncOptions = createMemo(() => {
    const column = openedColumn();
    return (
      props.getFilterOptions != null &&
      column != null &&
      isSelectLikeFilterType(openedType()) &&
      !(column.filterOptions && column.filterOptions.length > 0)
    );
  });
  const asyncSource = createAsyncSelectOptionsSource<T>();
  connectController(asyncSource, () => {
    const uses = usesAsyncOptions();
    const column = openedColumn();
    return {
      columnKey: uses && column ? column.key : null,
      column: uses ? column : null,
      columnFilters: props.columnFilters,
      globalText: props.globalFilterText,
      fetch: props.getFilterOptions ?? null,
    };
  });
  const asyncSnapshot = createExternalStoreSignal(asyncSource);

  const collectColumn = createMemo(() => (usesAsyncOptions() ? null : openedColumn()));
  const numeric = createMemo(() => openedType() === 'numberSet');
  const syncResult = createMemo(() =>
    resolveSyncSelectOptions(collectColumn(), optionRows().length, getOpenedColumnRawValueAt(), numeric()),
  );
  const sourceKey = createMemo(() => {
    const column = collectColumn();
    return column === null ? undefined : String(column.key);
  });
  const collector = createSelectOptionsCollector();
  connectController(collector, () => ({
    needsAsync: syncResult() === null,
    rowCount: optionRows().length,
    getRawValueAt: getOpenedColumnRawValueAt(),
    numeric: numeric(),
    sourceKey: sourceKey(),
  }));
  const collectorSnapshot = createExternalStoreSignal(collector);
  const optionsResult = createMemo(() => {
    if (usesAsyncOptions()) {
      return selectAsyncOptionsResult(asyncSnapshot(), openedColumn()?.key ?? null);
    }
    return (
      syncResult() ??
      selectCollectorResult(collectorSnapshot(), optionRows().length, getOpenedColumnRawValueAt(), sourceKey())
    );
  });

  // 派生値とコマンド(core engine/filterPopoverCommands)。
  const resolveDerived = createFilterPopoverDerivedResolver<T>();
  const derived = createMemo(() =>
    resolveDerived({
      openedFilterColumn: openedColumn(),
      openedFilterType: openedType(),
      openedFilterSelectOptions: optionsResult().options,
      openedFilterAllValues: optionsResult().allValues,
      columnFilters: props.columnFilters,
    }),
  );
  const commands = createFilterPopoverCommands<T>();
  connectController(commands, () => ({
    filterPopoverState: filterPopover.state(),
    openedFilterColumn: openedColumn(),
    openedFilterType: openedType(),
    columnFilters: props.columnFilters,
    derived: derived(),
    dispatch: props.dispatch,
    closeColumnFilterPopover: filterPopover.close,
    updateNumberDraft: filterPopover.updateNumberDraft,
    updateTextDraft: filterPopover.updateTextDraft,
    updateDateDraft: filterPopover.updateDateDraft,
    filterTexts: props.localeTexts,
  }));

  const texts = () => props.localeTexts as FilteringTexts;
  // 今の値の行(set は件数を一覧の下に出すので参考。number は既定の書き方を文言の表で作り直す)。
  const currentValueText = createMemo(() => {
    const column = openedColumn();
    if (!column) {
      return texts().filterCurrentNone;
    }
    const rawValue = props.columnFilters[column.key];
    if (isSetColumnFilterValue(rawValue)) {
      return formatLocaleText(rawValue.mode === 'exclude' ? texts().filterCurrentExcluded : texts().filterCurrentSelected, {
        count: rawValue.values.length,
      });
    }
    if (isNumberColumnFilterValue(rawValue)) {
      return describeColumnFilterValue(rawValue, { texts: props.localeTexts });
    }
    const text = columnFilterValueToDraftText(rawValue);
    return text.trim() ? text : texts().filterCurrentNone;
  });
  // 開いている列の相対の期間のチップの構成。
  const datePresets = createMemo(() => {
    const column = openedColumn();
    return column ? normalizeDateFilterPresets(column.dateFilterPresets, props.localeTexts) : undefined;
  });
  // 組み合わせの列の要約(「10 以上 かつ 3 件を選択」。掛けた条件から作るので表示と結果がいつも一致する)。
  const comboSummaryText = createMemo(() => {
    const column = openedColumn();
    const value = derived().openedSetFilterValue;
    return column && value && isActiveColumnFilterValue(value)
      ? describeColumnFilterValue(value, createColumnFilterDescribeOptions(column, props.localeTexts))
      : props.localeTexts.filterNone;
  });
  // 日付の入力欄の差し替え(columnKey はここで足す)。
  const renderDateInput = createMemo<ColumnFilterDateInputRenderer | undefined>(() => {
    const render = props.renderFilterDateInput;
    const column = openedColumn();
    if (!render || !column) {
      return undefined;
    }
    const columnKey = column.key;
    return (ctx) =>
      render({
        get value() {
          return ctx.value;
        },
        onChange: ctx.onChange,
        get ariaLabel() {
          return ctx.ariaLabel;
        },
        slot: ctx.slot,
        columnKey,
      });
  });

  return (
    <Show when={openedColumn()}>
      {(column) => (
        <Show when={filterPopover.layout()}>
          {(layout) => (
            <ColumnFilterPopover
              popoverSlot={props.popoverSlot}
              themeClassName={props.themeClassName}
              title={column().title || column().key}
              filterType={openedType() ?? 'text'}
              // serverSide は候補を表から集められないので、候補が空のときの文言を変えます(getFilterOptions の列は除く)。
              isServerSide={props.isServerSide && !usesAsyncOptions()}
              draftValue={filterPopover.state()?.draftValue ?? ''}
              numberConditionDraft={filterPopover.state()?.numberDraft ?? null}
              onNumberConditionDraftChange={commands.handleNumberConditionDraftChange}
              textConditionDraft={filterPopover.state()?.textDraft ?? null}
              onTextConditionDraftChange={commands.handleTextConditionDraftChange}
              dateConditionDraft={filterPopover.state()?.dateDraft ?? null}
              onDateConditionDraftChange={commands.handleDateConditionDraftChange}
              datePresets={datePresets()}
              renderDateInput={renderDateInput()}
              onComboConditionClear={commands.handleComboConditionClear}
              onComboSelectionClear={commands.handleComboSelectionClear}
              comboSummaryText={comboSummaryText()}
              currentValueText={currentValueText()}
              layout={layout()}
              selectOptions={derived().openedPopoverSelectOptions}
              setSelection={derived().openedSetSelection}
              optionsStatus={optionsResult().status}
              optionsProgress={optionsResult().progress}
              optionsTruncated={optionsResult().truncated}
              optionsErrorMessage={optionsResult().errorMessage}
              onOptionsRetry={usesAsyncOptions() ? asyncSource.retry : undefined}
              setPanel={filterPopover.setPanel}
              panelRef={filterPopover.panelRef}
              textInputRef={filterPopover.textInputRef}
              selectRef={filterPopover.selectRef}
              onRequestClose={filterPopover.close}
              onDraftChange={filterPopover.updateDraft}
              onApply={commands.applyFilterPopoverValue}
              onClear={commands.clearFilterPopoverValue}
              onSetValueToggle={commands.handleSetFilterValueToggle}
              onSetSelectAllChange={commands.handleSetFilterSelectAllChange}
              onSetClear={commands.clearSetFilterPopoverValue}
              onSetReplaceSelection={commands.handleSetFilterReplaceSelection}
            />
          )}
        </Show>
      )}
    </Show>
  );
}