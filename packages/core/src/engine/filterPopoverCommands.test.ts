// 追加(本体分解 E-4b): フィルター popover の派生値 / コマンド群の単体テストです(set 選択状態の導出 / 反転 set の
//   トグル / (すべて選択) の正規化 / 複合列の条件編集 / 適用ボタン方式の commit)。
import { describe, it, expect, vi } from 'vitest';
import {
  createFilterPopoverCommands,
  createFilterPopoverDerivedResolver,
  type FilterPopoverCommandsArgs,
  type FilterPopoverDerivedInputs,
} from './filterPopoverCommands';
import type { ColumnFilterValue, GridColumn } from '../model/gridTypes.unbound';
import type { GridUiAction } from '../model/gridActions';

type Row = { name: string; amount: number };

const nameColumn: GridColumn<Row> = { key: 'name', title: '名前', width: 120, filterType: 'set' };
const amountColumn: GridColumn<Row> = { key: 'amount', title: '金額', width: 100, filterType: 'numberSet' };
const options = [
  { label: 'a', value: 'a' },
  { label: 'b', value: 'b' },
  { label: 'c', value: 'c' },
];

const makeDerivedInputs = (
  overrides: Partial<FilterPopoverDerivedInputs<Row>> = {},
): FilterPopoverDerivedInputs<Row> => ({
  openedFilterColumn: nameColumn,
  openedFilterType: 'set',
  openedFilterSelectOptions: options,
  openedFilterAllValues: new Set(['a', 'b', 'c']),
  columnFilters: {},
  ...overrides,
});

const setup = (
  derivedOverrides: Partial<FilterPopoverDerivedInputs<Row>> = {},
  argsOverrides: Partial<FilterPopoverCommandsArgs<Row>> = {},
) => {
  const resolveDerived = createFilterPopoverDerivedResolver<Row>();
  const derivedInputs = makeDerivedInputs(derivedOverrides);
  const derived = resolveDerived(derivedInputs);
  const actions: GridUiAction[] = [];
  const commands = createFilterPopoverCommands<Row>();
  const args: FilterPopoverCommandsArgs<Row> = {
    filterPopoverState: { columnKey: derivedInputs.openedFilterColumn!.key, draftValue: '', numberDraft: null },
    openedFilterColumn: derivedInputs.openedFilterColumn,
    openedFilterType: derivedInputs.openedFilterType,
    columnFilters: derivedInputs.columnFilters,
    derived,
    dispatch: (action) => {
      actions.push(action);
    },
    closeColumnFilterPopover: vi.fn(),
    updateNumberDraft: vi.fn(),
    updateTextDraft: vi.fn(),
    updateDateDraft: vi.fn(),
    ...argsOverrides,
  };
  commands.update(args);
  return { commands, args, actions, derived };
};

describe('createFilterPopoverDerivedResolver', () => {
  it('set / 複合記述子から選択状態を導出し、filterOptions 明示列は反転不可', () => {
    const resolve = createFilterPopoverDerivedResolver<Row>();
    const none = resolve(makeDerivedInputs());
    expect(none.openedSetSelection).toBeNull();
    expect(none.openedColumnCanInvert).toBe(true);
    expect(none.openedPopoverSelectOptions).toBe(options);

    const combo: ColumnFilterValue = { kind: 'numberSet', condition: null, set: { mode: 'exclude', values: ['b'] } };
    const withCombo = resolve(
      makeDerivedInputs({ openedFilterColumn: amountColumn, openedFilterType: 'numberSet', columnFilters: { amount: combo } }),
    );
    expect(withCombo.openedSetSelection).toEqual({ mode: 'exclude', values: new Set(['b']) });
    expect(withCombo.isComboFilterColumn).toBe(true);

    const explicit = resolve(makeDerivedInputs({ openedFilterColumn: { ...nameColumn, filterOptions: [{ label: 'a', value: 'a' }] } }));
    expect(explicit.openedColumnCanInvert).toBe(false);
  });
});

describe('createFilterPopoverCommands', () => {
  it('全選択からの解除は反転可能列なら exclude{value}、選択し直すと全選択 = clear', () => {
    const { commands, actions } = setup();
    commands.handleSetFilterValueToggle('b');
    expect(actions).toEqual([
      { type: 'filter/setColumn', columnKey: 'name', value: { kind: 'set', mode: 'exclude', values: ['b'] } },
    ]);
    // exclude{b} の状態から b を再選択 → 全選択 → clear。
    const restored = setup({ columnFilters: { name: { kind: 'set', mode: 'exclude', values: ['b'] } } });
    restored.commands.handleSetFilterValueToggle('b');
    expect(restored.actions.map((action) => action.type)).toEqual(['filter/clearColumn']);
  });

  it('(すべて選択) の解除は include{} で表現し、検索 Enter 確定は一致候補の include 集合へ置換', () => {
    const { commands, actions } = setup();
    commands.handleSetFilterSelectAllChange('all', false);
    expect(actions).toEqual([
      { type: 'filter/setColumn', columnKey: 'name', value: { kind: 'set', mode: 'include', values: [] } },
    ]);
    actions.length = 0;
    commands.handleSetFilterReplaceSelection(['a', 'c']);
    expect(actions[0]).toEqual({
      type: 'filter/setColumn',
      columnKey: 'name',
      value: { kind: 'set', mode: 'include', values: ['a', 'c'] },
    });
  });

  it('複合列の条件編集は draft 反映 + 即時 dispatch(選択は保持)、条件も選択も無ければ clear', () => {
    const existing: ColumnFilterValue = { kind: 'numberSet', condition: null, set: { mode: 'include', values: ['1'] } };
    const { commands, args, actions } = setup({
      openedFilterColumn: amountColumn,
      openedFilterType: 'numberSet',
      columnFilters: { amount: existing },
    });
    commands.handleNumberConditionDraftChange({ operator: 'gte', value1: '10', value2: '' });
    expect(args.updateNumberDraft).toHaveBeenCalledTimes(1);
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.type).toBe('filter/setColumn');
    if (action.type === 'filter/setColumn' && action.value.kind === 'numberSet') {
      expect(action.value.set).toEqual({ mode: 'include', values: ['1'] });
      expect(action.value.condition?.mode).toBe('comparison');
    }
    // 値の個別クリア(条件は保持されないケース: condition なしのため clear)。
    actions.length = 0;
    commands.handleComboSelectionClear();
    expect(actions.map((a) => a.type)).toEqual(['filter/clearColumn']);
  });

  it('適用ボタン方式: text は trim した記述子で commit して閉じる、空入力は clear、set は閉じるだけ', () => {
    const text = setup(
      { openedFilterColumn: { ...nameColumn, filterType: 'text' }, openedFilterType: 'text' },
      { filterPopoverState: { columnKey: 'name', draftValue: '  abc ', numberDraft: null } },
    );
    text.commands.applyFilterPopoverValue();
    expect(text.actions).toEqual([{ type: 'filter/setColumn', columnKey: 'name', value: { kind: 'text', value: 'abc' } }]);
    expect(text.args.closeColumnFilterPopover).toHaveBeenCalledTimes(1);

    const empty = setup(
      { openedFilterColumn: { ...nameColumn, filterType: 'text' }, openedFilterType: 'text' },
      { filterPopoverState: { columnKey: 'name', draftValue: '   ', numberDraft: null } },
    );
    empty.commands.applyFilterPopoverValue();
    expect(empty.actions.map((a) => a.type)).toEqual(['filter/clearColumn']);

    const set = setup();
    set.commands.applyFilterPopoverValue();
    expect(set.actions).toEqual([]);
    expect(set.args.closeColumnFilterPopover).toHaveBeenCalledTimes(1);
  });
});

// 追加(ime-fix): IME 変換中の 1 打鍵ごとの通知(commit: false)では draft だけ反映し、記述子は dispatch しません。
describe('createFilterPopoverCommands の IME 変換中ガード(ime-fix)', () => {
  it('commit: false は draft 反映のみで dispatch せず、確定(既定 = commit)で 1 回 dispatch する', () => {
    const textColumn: GridColumn<Row> = { key: 'name', title: '名前', width: 120, filterType: 'textSet' };
    const { commands, args, actions } = setup({ openedFilterColumn: textColumn, openedFilterType: 'textSet' });
    commands.handleTextConditionDraftChange({ operator: 'contains', value: 'ろ' }, { commit: false });
    commands.handleTextConditionDraftChange({ operator: 'contains', value: 'ろっか' }, { commit: false });
    expect(args.updateTextDraft).toHaveBeenCalledTimes(2);
    expect(actions).toEqual([]);
    commands.handleTextConditionDraftChange({ operator: 'contains', value: '六角' });
    expect(args.updateTextDraft).toHaveBeenCalledTimes(3);
    expect(actions).toEqual([
      {
        type: 'filter/setColumn',
        columnKey: 'name',
        value: { kind: 'textSet', condition: { mode: 'contains', value: '六角' }, set: null },
      },
    ]);
  });

  it('number 条件も同じ規則(commit: false は dispatch しない)', () => {
    const { commands, args, actions } = setup({ openedFilterColumn: amountColumn, openedFilterType: 'numberSet' });
    commands.handleNumberConditionDraftChange({ operator: 'gte', value1: '１', value2: '' }, { commit: false });
    expect(args.updateNumberDraft).toHaveBeenCalledTimes(1);
    expect(actions).toEqual([]);
    commands.handleNumberConditionDraftChange({ operator: 'gte', value1: '10', value2: '' });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('filter/setColumn');
  });
});