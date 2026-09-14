// 追加(本体分解 E-4b): 列フィルター popover の派生値とコマンド群です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「filter popover actions」セクションを移設)。
//   - createFilterPopoverDerivedResolver: 開いている列の候補(dateSet は正規化日付キーへ再集約)/ 全値集合 /
//     set 選択状態 { mode, values }(null = 全選択)/ 反転可否 / 複合列かの派生値(メモ単位は旧 useMemo と同一)。
//   - createFilterPopoverCommands: set のチェック / (すべて選択) / 検索 Enter 確定 / クリア、複合列の条件編集
//     (即時適用)/ 条件・値の個別クリア、適用ボタン方式(text / number / date / select / custom)の commit。
//     update(args) で最新の状態を受け取り、各コマンドは呼び出し時点の値を読みます(参照は恒久安定)。
//   反転 set: values は常に小さい側のみ(include=選択値 / exclude=非選択値)。巨大側は作りません。
import type {
  ColumnFilterUiType,
  ColumnFilterValue,
  GridColumn,
  SetColumnFilterValue,
} from '../model/gridTypes.unbound';
import { gridActions, type GridUiAction } from '../model/gridActions';
import {
  isDateSetColumnFilterValue,
  isNumberSetColumnFilterValue,
  isSetColumnFilterValue,
  isTextSetColumnFilterValue,
} from '../logic/filtering';
import { isSetValueSelected, type ColumnFilterSetSelection } from '../logic/setFilterSelection';
import {
  DEFAULT_NUMBER_FILTER_DRAFT,
  buildNumberColumnFilterValueFromDraft,
  buildParsedNumberFilterFromDraft,
  type NumberFilterConditionDraft,
} from '../logic/numberFilterCondition';
import {
  DEFAULT_TEXT_FILTER_DRAFT,
  buildParsedTextFilterFromDraft,
  type TextFilterConditionDraft,
} from '../logic/textFilterCondition';
import {
  DEFAULT_DATE_FILTER_DRAFT,
  buildParsedDateFilterFromDraft,
  type DateFilterConditionDraft,
} from '../logic/dateFilterCondition';
import { normalizeDateSetOptions } from '../logic/dateFilterTree';
import type { SelectOptionEntry } from '../logic/selectOptions';
import { createMemo } from './memo';

// ── set 演算ヘルパ(小さい側だけを更新) ──────────────────
const setWith = (base: ReadonlySet<string>, value: string): Set<string> => {
  const next = new Set(base);
  next.add(value);
  return next;
};
const setWithout = (base: ReadonlySet<string>, value: string): Set<string> => {
  const next = new Set(base);
  next.delete(value);
  return next;
};
const setUnion = (base: ReadonlySet<string>, add: string[]): Set<string> => {
  const next = new Set(base);
  for (const value of add) {
    next.add(value);
  }
  return next;
};
const setDifference = (base: ReadonlySet<string>, remove: string[]): Set<string> => {
  const next = new Set(base);
  for (const value of remove) {
    next.delete(value);
  }
  return next;
};

type SetPart = { mode?: 'include' | 'exclude'; values: string[] } | null;

// ── 派生値 ─────────────────────────────────────────────

export type FilterPopoverDerivedInputs<T> = {
  openedFilterColumn: GridColumn<T> | null;
  openedFilterType: ColumnFilterUiType | null;
  // 候補コレクタの出力(通常規模 = 同期 / 大規模 = 時間分割)。
  openedFilterSelectOptions: SelectOptionEntry[];
  openedFilterAllValues: ReadonlySet<string>;
  // 即時値(遅延化しない。チェック表示は即時 uiState を参照)。
  columnFilters: Record<string, ColumnFilterValue>;
};

export type FilterPopoverDerived = {
  isDateSetFilterColumn: boolean;
  // popover 配線(候補 / 全値集合 / total)が参照する候補。dateSet はキー単位へ再集約済み。
  openedPopoverSelectOptions: SelectOptionEntry[];
  openedPopoverAllValues: ReadonlySet<string>;
  openedSetFilterValue: ColumnFilterValue | undefined;
  // null = 全選択(フィルター未設定)。
  openedSetSelection: ColumnFilterSetSelection | null;
  // filterOptions を明示指定した列は universe が全行値を覆わない可能性があるため反転しない(include 固定)。
  openedColumnCanInvert: boolean;
  isComboFilterColumn: boolean;
};

export const createFilterPopoverDerivedResolver = <T,>() => {
  const memoOptions = createMemo((isDateSet: boolean, options: SelectOptionEntry[]): SelectOptionEntry[] =>
    isDateSet ? normalizeDateSetOptions(options) : options,
  );
  const memoAllValues = createMemo(
    (isDateSet: boolean, options: SelectOptionEntry[], allValues: ReadonlySet<string>): ReadonlySet<string> =>
      isDateSet ? new Set(options.map((option) => option.value)) : allValues,
  );
  // 複合(numberSet / textSet / dateSet)記述子の set 部分からも導出します(形は kind:'set' と同一)。
  const memoSelection = createMemo((value: ColumnFilterValue | undefined): ColumnFilterSetSelection | null => {
    const setPart = isSetColumnFilterValue(value)
      ? value
      : isNumberSetColumnFilterValue(value) || isTextSetColumnFilterValue(value) || isDateSetColumnFilterValue(value)
        ? value.set
        : null;
    if (!setPart) {
      return null;
    }
    return {
      mode: setPart.mode === 'exclude' ? 'exclude' : 'include',
      values: new Set(setPart.values),
    };
  });
  return (inputs: FilterPopoverDerivedInputs<T>): FilterPopoverDerived => {
    const { openedFilterColumn, openedFilterType, openedFilterSelectOptions, openedFilterAllValues, columnFilters } =
      inputs;
    const isDateSetFilterColumn = openedFilterType === 'dateSet';
    const openedPopoverSelectOptions = memoOptions(isDateSetFilterColumn, openedFilterSelectOptions);
    const openedPopoverAllValues = memoAllValues(isDateSetFilterColumn, openedPopoverSelectOptions, openedFilterAllValues);
    const openedSetFilterValue = openedFilterColumn ? columnFilters[openedFilterColumn.key] : undefined;
    return {
      isDateSetFilterColumn,
      openedPopoverSelectOptions,
      openedPopoverAllValues,
      openedSetFilterValue,
      openedSetSelection: memoSelection(openedSetFilterValue),
      openedColumnCanInvert: !(openedFilterColumn?.filterOptions && openedFilterColumn.filterOptions.length > 0),
      isComboFilterColumn:
        openedFilterType === 'numberSet' || openedFilterType === 'textSet' || openedFilterType === 'dateSet',
    };
  };
};

// ── コマンド ───────────────────────────────────────────

export type FilterPopoverStateLike = {
  columnKey: string;
  draftValue: string;
  numberDraft: NumberFilterConditionDraft | null;
};

export type FilterPopoverCommandsArgs<T> = {
  filterPopoverState: FilterPopoverStateLike | null;
  openedFilterColumn: GridColumn<T> | null;
  openedFilterType: ColumnFilterUiType | null;
  columnFilters: Record<string, ColumnFilterValue>;
  derived: FilterPopoverDerived;
  dispatch: (action: GridUiAction) => void;
  closeColumnFilterPopover: () => void;
  updateNumberDraft: (draft: NumberFilterConditionDraft) => void;
  updateTextDraft: (draft: TextFilterConditionDraft) => void;
  updateDateDraft: (draft: DateFilterConditionDraft) => void;
};

export type FilterPopoverCommands<T> = {
  update: (args: FilterPopoverCommandsArgs<T>) => void;
  handleSetFilterValueToggle: (value: string) => void;
  handleSetFilterSelectAllChange: (scope: 'all' | string[], nextChecked: boolean) => void;
  handleSetFilterReplaceSelection: (values: string[]) => void;
  clearSetFilterPopoverValue: () => void;
  handleNumberConditionDraftChange: (draft: NumberFilterConditionDraft) => void;
  handleTextConditionDraftChange: (draft: TextFilterConditionDraft) => void;
  handleDateConditionDraftChange: (draft: DateFilterConditionDraft) => void;
  handleComboConditionClear: () => void;
  handleComboSelectionClear: () => void;
  applyFilterPopoverValue: () => void;
  clearFilterPopoverValue: () => void;
};

export const createFilterPopoverCommands = <T,>(): FilterPopoverCommands<T> => {
  let args: FilterPopoverCommandsArgs<T> | null = null;
  const requireArgs = (): FilterPopoverCommandsArgs<T> => {
    if (args === null) {
      throw new Error('[SpreadsheetGrid] filterPopoverCommands は update 前に呼べません。');
    }
    return args;
  };

  // 複合列の記述子を「現在の条件を保持したまま set 部分だけ差し替え」で構築します。condition も setPart も無ければ
  //   null(= フィルターなし。呼び出し側で clearColumn へ倒す)。複合列でなければ null。
  const buildComboDescriptorWithSet = (columnKey: string, setPart: SetPart): ColumnFilterValue | null => {
    const { openedFilterColumn, openedFilterType, columnFilters } = requireArgs();
    const filterType = openedFilterColumn?.key === columnKey ? openedFilterType : undefined;
    const currentValue = columnFilters[columnKey];
    if (filterType === 'numberSet') {
      const condition = isNumberSetColumnFilterValue(currentValue) ? currentValue.condition : null;
      if (!condition && !setPart) {
        return null;
      }
      return { kind: 'numberSet', condition, set: setPart };
    }
    if (filterType === 'textSet') {
      const condition = isTextSetColumnFilterValue(currentValue) ? currentValue.condition : null;
      if (!condition && !setPart) {
        return null;
      }
      return { kind: 'textSet', condition, set: setPart };
    }
    if (filterType === 'dateSet') {
      const condition = isDateSetColumnFilterValue(currentValue) ? currentValue.condition : null;
      if (!condition && !setPart) {
        return null;
      }
      return { kind: 'dateSet', condition, set: setPart };
    }
    return null;
  };

  // set 選択結果を reducer へ反映します。全選択 → clearColumn(複合列は condition 保持で set: null)/ 0 件 → include{} /
  //   中間 → ハンドラが選んだ mode の小さい側。total は候補総数(= universe サイズ)。
  const commitSetFilterSelection = (columnKey: string, next: ColumnFilterSetSelection, total: number) => {
    const { openedFilterColumn, derived, dispatch } = requireArgs();
    const isComboColumn = openedFilterColumn?.key === columnKey && derived.isComboFilterColumn;
    const selectedCount = next.mode === 'include' ? next.values.size : total - next.values.size;
    if (selectedCount >= total) {
      if (isComboColumn) {
        const descriptor = buildComboDescriptorWithSet(columnKey, null);
        if (descriptor) {
          dispatch(gridActions.setColumnFilter(columnKey, descriptor));
          return;
        }
      }
      dispatch(gridActions.clearColumnFilter(columnKey));
      return;
    }
    const setPart =
      selectedCount <= 0
        ? { mode: 'include' as const, values: [] as string[] }
        : { mode: next.mode, values: Array.from(next.values) };
    if (isComboColumn) {
      const descriptor = buildComboDescriptorWithSet(columnKey, setPart);
      if (descriptor) {
        dispatch(gridActions.setColumnFilter(columnKey, descriptor));
        return;
      }
    }
    const nextValue: SetColumnFilterValue = { kind: 'set', ...setPart };
    dispatch(gridActions.setColumnFilter(columnKey, nextValue));
  };

  // チェックボックス 1 件のトグル(即時適用)。null(全選択)からの解除は canInvert 列なら exclude{value}、
  //   非 invert 列(universe が小)なら include{universe∖value}。
  const handleSetFilterValueToggle = (value: string) => {
    const { filterPopoverState, derived } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    const { openedPopoverSelectOptions, openedSetSelection: selection, openedColumnCanInvert, openedPopoverAllValues } =
      derived;
    const total = openedPopoverSelectOptions.length;
    let next: ColumnFilterSetSelection;
    if (isSetValueSelected(selection, value)) {
      if (selection === null) {
        next = openedColumnCanInvert
          ? { mode: 'exclude', values: new Set([value]) }
          : { mode: 'include', values: setWithout(openedPopoverAllValues, value) };
      } else if (selection.mode === 'include') {
        next = { mode: 'include', values: setWithout(selection.values, value) };
      } else {
        next = { mode: 'exclude', values: setWith(selection.values, value) };
      }
    } else {
      // value を選択します(selection は null ではない: null は全選択)。
      next =
        selection!.mode === 'include'
          ? { mode: 'include', values: setWith(selection!.values, value) }
          : { mode: 'exclude', values: setWithout(selection!.values, value) };
    }
    commitSetFilterSelection(filterPopoverState.columnKey, next, total);
  };

  // (すべて選択) の一括トグル。非検索は scope='all'(全候補)、検索中は表示中候補(= 小さい側)の values。
  const handleSetFilterSelectAllChange = (scope: 'all' | string[], nextChecked: boolean) => {
    const { filterPopoverState, derived } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    const columnKey = filterPopoverState.columnKey;
    const { openedPopoverSelectOptions, openedSetSelection: selection, openedColumnCanInvert, openedPopoverAllValues } =
      derived;
    const total = openedPopoverSelectOptions.length;
    if (scope === 'all') {
      commitSetFilterSelection(
        columnKey,
        nextChecked ? { mode: 'exclude', values: new Set() } : { mode: 'include', values: new Set() },
        total,
      );
      return;
    }
    let next: ColumnFilterSetSelection;
    if (nextChecked) {
      if (selection === null) {
        commitSetFilterSelection(columnKey, { mode: 'exclude', values: new Set() }, total);
        return;
      }
      next =
        selection.mode === 'include'
          ? { mode: 'include', values: setUnion(selection.values, scope) }
          : { mode: 'exclude', values: setDifference(selection.values, scope) };
    } else {
      if (selection === null) {
        next = openedColumnCanInvert
          ? { mode: 'exclude', values: new Set(scope) }
          : { mode: 'include', values: setDifference(openedPopoverAllValues, scope) };
      } else if (selection.mode === 'include') {
        next = { mode: 'include', values: setDifference(selection.values, scope) };
      } else {
        next = { mode: 'exclude', values: setUnion(selection.values, scope) };
      }
    }
    commitSetFilterSelection(columnKey, next, total);
  };

  // 検索 Enter 確定: 選択を「検索一致候補のみ」の include 集合へ置換(Excel の検索 → OK と同挙動)。
  const handleSetFilterReplaceSelection = (values: string[]) => {
    const { filterPopoverState, derived } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    commitSetFilterSelection(
      filterPopoverState.columnKey,
      { mode: 'include', values: new Set(values) },
      derived.openedPopoverSelectOptions.length,
    );
  };

  // set フィルターの「クリア」(popover は閉じない)。複合列では条件 + 選択の全消し(draft も既定へ)。
  const clearSetFilterPopoverValue = () => {
    const { filterPopoverState, openedFilterType, dispatch, updateNumberDraft, updateTextDraft, updateDateDraft } =
      requireArgs();
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    if (openedFilterType === 'numberSet') {
      updateNumberDraft(DEFAULT_NUMBER_FILTER_DRAFT);
    }
    if (openedFilterType === 'textSet') {
      updateTextDraft(DEFAULT_TEXT_FILTER_DRAFT);
    }
    if (openedFilterType === 'dateSet') {
      updateDateDraft(DEFAULT_DATE_FILTER_DRAFT);
    }
  };

  // 複合列の set 部分を「現在の記述子」から取り出します(旧 kind:'set' 値が残っていれば取り込む)。
  const getComboColumnSetPart = (columnKey: string): SetPart => {
    const currentValue = requireArgs().columnFilters[columnKey];
    if (
      isNumberSetColumnFilterValue(currentValue) ||
      isTextSetColumnFilterValue(currentValue) ||
      isDateSetColumnFilterValue(currentValue)
    ) {
      return currentValue.set;
    }
    if (isSetColumnFilterValue(currentValue)) {
      return { mode: currentValue.mode, values: currentValue.values };
    }
    return null;
  };

  // 複合列の条件編集(即時適用): draft を UI へ反映しつつ、合成した condition で記述子を即時 dispatch。
  //   条件も選択も無ければ記述子を削除(残っていれば)。
  const commitComboCondition = (hasCondition: boolean, build: (setPart: SetPart) => ColumnFilterValue) => {
    const { filterPopoverState, columnFilters, dispatch } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    const columnKey = filterPopoverState.columnKey;
    const setPart = getComboColumnSetPart(columnKey);
    if (!hasCondition && !setPart) {
      if (columnFilters[columnKey]) {
        dispatch(gridActions.clearColumnFilter(columnKey));
      }
      return;
    }
    dispatch(gridActions.setColumnFilter(columnKey, build(setPart)));
  };
  const handleNumberConditionDraftChange = (draft: NumberFilterConditionDraft) => {
    const { updateNumberDraft, openedFilterType } = requireArgs();
    updateNumberDraft(draft);
    if (openedFilterType !== 'numberSet') {
      return;
    }
    const condition = buildParsedNumberFilterFromDraft(draft);
    commitComboCondition(condition !== null, (set) => ({ kind: 'numberSet', condition, set }));
  };
  const handleTextConditionDraftChange = (draft: TextFilterConditionDraft) => {
    const { updateTextDraft, openedFilterType } = requireArgs();
    updateTextDraft(draft);
    if (openedFilterType !== 'textSet') {
      return;
    }
    const condition = buildParsedTextFilterFromDraft(draft);
    commitComboCondition(condition !== null, (set) => ({ kind: 'textSet', condition, set }));
  };
  const handleDateConditionDraftChange = (draft: DateFilterConditionDraft) => {
    const { updateDateDraft, openedFilterType } = requireArgs();
    updateDateDraft(draft);
    if (openedFilterType !== 'dateSet') {
      return;
    }
    const condition = buildParsedDateFilterFromDraft(draft);
    commitComboCondition(condition !== null, (set) => ({ kind: 'dateSet', condition, set }));
  };

  // 複合の「条件」個別クリア(選択は保持)。
  const handleComboConditionClear = () => {
    const { openedFilterType } = requireArgs();
    if (openedFilterType === 'textSet') {
      handleTextConditionDraftChange(DEFAULT_TEXT_FILTER_DRAFT);
      return;
    }
    if (openedFilterType === 'dateSet') {
      handleDateConditionDraftChange(DEFAULT_DATE_FILTER_DRAFT);
      return;
    }
    handleNumberConditionDraftChange(DEFAULT_NUMBER_FILTER_DRAFT);
  };
  // 複合の「値」個別クリア(条件は保持)。条件も無ければ記述子ごと削除。
  const handleComboSelectionClear = () => {
    const { filterPopoverState, dispatch } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    const columnKey = filterPopoverState.columnKey;
    const descriptor = buildComboDescriptorWithSet(columnKey, null);
    if (descriptor) {
      dispatch(gridActions.setColumnFilter(columnKey, descriptor));
      return;
    }
    dispatch(gridActions.clearColumnFilter(columnKey));
  };

  // 適用ボタン方式の commit。set / 複合は即時適用のため閉じるだけ。number は構造化 draft から記述子を構築、
  //   text / date / select / custom はタグ付き記述子で commit(空入力は clearColumn)。
  const applyFilterPopoverValue = () => {
    const { filterPopoverState, openedFilterType, dispatch, closeColumnFilterPopover } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    const filterType = openedFilterType ?? 'text';
    if (filterType === 'set' || filterType === 'numberSet' || filterType === 'textSet' || filterType === 'dateSet') {
      closeColumnFilterPopover();
      return;
    }
    if (filterType === 'number') {
      const descriptor = filterPopoverState.numberDraft
        ? buildNumberColumnFilterValueFromDraft(filterPopoverState.numberDraft)
        : null;
      if (!descriptor) {
        dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
        closeColumnFilterPopover();
        return;
      }
      dispatch(gridActions.setColumnFilter(filterPopoverState.columnKey, descriptor));
      closeColumnFilterPopover();
      return;
    }
    const normalized = filterType === 'select' ? filterPopoverState.draftValue : filterPopoverState.draftValue.trim();
    if (!normalized) {
      dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
      closeColumnFilterPopover();
      return;
    }
    const descriptor: ColumnFilterValue =
      filterType === 'select'
        ? { kind: 'select', value: normalized }
        : filterType === 'date'
          ? { kind: 'date', value: normalized }
          : filterType === 'custom'
            ? { kind: 'custom', value: normalized }
            : { kind: 'text', value: normalized };
    dispatch(gridActions.setColumnFilter(filterPopoverState.columnKey, descriptor));
    closeColumnFilterPopover();
  };
  const clearFilterPopoverValue = () => {
    const { filterPopoverState, dispatch, closeColumnFilterPopover } = requireArgs();
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    closeColumnFilterPopover();
  };

  return {
    update: (next) => {
      args = next;
    },
    handleSetFilterValueToggle,
    handleSetFilterSelectAllChange,
    handleSetFilterReplaceSelection,
    clearSetFilterPopoverValue,
    handleNumberConditionDraftChange,
    handleTextConditionDraftChange,
    handleDateConditionDraftChange,
    handleComboConditionClear,
    handleComboSelectionClear,
    applyFilterPopoverValue,
    clearFilterPopoverValue,
  };
};