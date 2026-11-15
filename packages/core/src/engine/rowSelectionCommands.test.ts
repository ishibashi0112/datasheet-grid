// 追加(本体分解 E-4c): 行選択コマンド群の単体テストです(トグル / shift 範囲 / single / 全選択トグル /
//   controlled の onChange のみ + update での同期 / SSRM 未ロード行の無視)。
import { describe, it, expect, vi } from 'vitest';
import { createRowSelectionCommands, type RowSelectionCommandsArgs } from './rowSelectionCommands';
import type { RowModel, RowSelectionModel, RowSelectionState } from '../model/gridTypes.unbound';
import type { GridUiAction } from '../model/gridActions';
import { createEmptyRowSelection, rowSelectionFromModel } from '../logic/rowSelection';

type Row = { id: number } | undefined;

const rows: Row[] = [{ id: 1 }, { id: 2 }, { id: 3 }, undefined, { id: 5 }];
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};

const setup = (overrides: Partial<RowSelectionCommandsArgs<Row>> = {}) => {
  const actions: GridUiAction[] = [];
  const onRowSelectionChange = vi.fn<(model: RowSelectionModel) => void>();
  const commands = createRowSelectionCommands<Row>();
  const args: RowSelectionCommandsArgs<Row> = {
    rowModel,
    rowSelectionState: createEmptyRowSelection(),
    rowSelectionMode: 'multiple',
    onRowSelectionChange,
    controlledRowSelectionModel: undefined,
    leafRowCount: rows.length,
    dispatch: (action) => {
      actions.push(action);
    },
    ...overrides,
  };
  commands.update(args);
  return { commands, args, actions, onRowSelectionChange };
};

const lastState = (actions: GridUiAction[]): RowSelectionState | undefined => {
  const action = actions[actions.length - 1];
  return action?.type === 'rowSelect/set' ? action.state : undefined;
};

describe('createRowSelectionCommands', () => {
  it('multiple: クリックでトグル、shift+クリックでアンカーからの範囲(未ロード行はスキップ)', () => {
    const { commands, args, actions, onRowSelectionChange } = setup();
    commands.handleGutterRowSelect(0, { shiftKey: false });
    expect(onRowSelectionChange).toHaveBeenCalledWith({ type: 'include', rowKeys: [1] });
    // 状態を反映して次の操作へ(shell の再レンダー相当)。
    commands.update({ ...args, rowSelectionState: lastState(actions)! });
    commands.handleGutterRowSelect(4, { shiftKey: true });
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'include', rowKeys: [1, 2, 3, 5] });
    // 未ロード行(index 3)の直接クリックは無視。
    commands.handleGutterRowSelect(3, { shiftKey: false });
    expect(onRowSelectionChange).toHaveBeenCalledTimes(2);
  });

  // 追加(1.0.2 / 2026-11-09 実アプリの総点検 H-07): コールバックの中でハンドルを読むと 1 つ前の値が返っていた。
  it('通知の間だけ pendingRowSelection が新しい選択を返す。uncontrolled は通知より先に反映する(H-07)', () => {
    const seen: Array<{ pending: RowSelectionState | null; dispatched: number }> = [];
    const holder: { commands: ReturnType<typeof createRowSelectionCommands<Row>> | null; actions: GridUiAction[] } = {
      commands: null,
      actions: [],
    };
    const onRowSelectionChange = vi.fn(() => {
      seen.push({ pending: holder.commands?.pendingRowSelection() ?? null, dispatched: holder.actions.length });
    });
    const { commands, actions } = setup({ onRowSelectionChange });
    holder.commands = commands;
    holder.actions = actions;
    commands.handleGutterRowSelect(1, { shiftKey: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.dispatched).toBe(1);
    expect(seen[0]?.pending).toEqual(lastState(actions));
    expect(commands.pendingRowSelection()).toBeNull();

    // controlled: 反映はしないが、通知の間は新しい選択を見せる。
    seen.length = 0;
    const controlled = setup({ onRowSelectionChange, controlledRowSelectionModel: { type: 'include', rowKeys: [] } });
    holder.commands = controlled.commands;
    holder.actions = controlled.actions;
    controlled.commands.handleGutterRowSelect(2, { shiftKey: false });
    expect(seen[0]?.pending).toEqual(rowSelectionFromModel({ type: 'include', rowKeys: [3] }));
    expect(controlled.commands.pendingRowSelection()).toBeNull();
  });

  it('single: 常に単一選択、ドラッグもポインタ下の行を単一選択', () => {
    const { commands, onRowSelectionChange } = setup({ rowSelectionMode: 'single' });
    commands.handleGutterRowSelect(1, { shiftKey: true });
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'include', rowKeys: [2] });
    commands.handleGutterRowSelectDrag(2);
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'include', rowKeys: [3] });
  });

  it('全選択トグル: 未選択 → 全選択(exclude 空)、全選択済み → 解除', () => {
    const { commands, args, actions, onRowSelectionChange } = setup();
    commands.handleToggleSelectAllRows();
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'exclude', rowKeys: [] });
    commands.update({ ...args, rowSelectionState: lastState(actions)! });
    commands.handleToggleSelectAllRows();
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'include', rowKeys: [] });
  });

  it('controlled: commit は onChange のみ(dispatch しない)、update で prop の記述子を reducer へ同期', () => {
    const model: RowSelectionModel = { type: 'include', rowKeys: [2] };
    const { commands, args, actions, onRowSelectionChange } = setup({ controlledRowSelectionModel: model });
    // 初回 update で同期 dispatch。
    expect(actions.map((action) => action.type)).toEqual(['rowSelect/set']);
    actions.length = 0;
    commands.update({ ...args, rowSelectionState: rowSelectionFromModel(model) });
    expect(actions).toEqual([]);
    commands.handleGutterRowSelect(0, { shiftKey: false });
    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    expect(actions).toEqual([]);
    // 同じ記述子のまま再 update しても同期は走らない。変化があれば走る。
    commands.update({ ...args, rowSelectionState: rowSelectionFromModel(model) });
    expect(actions).toEqual([]);
    commands.update({ ...args, controlledRowSelectionModel: { type: 'include', rowKeys: [1] } });
    expect(actions.map((action) => action.type)).toEqual(['rowSelect/set']);
  });

  // 追加(1.0.1 / 実アプリの総点検 AP-03): フィルターで隠れている行があるときは、見えている行だけを選ぶ / 外す。
  it('フィルター中の全選択トグル: 見えている行だけを選び、選択済みなら見えている行だけ外す(AP-03)', () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const filteredDataRows = {
      rows: data,
      order: Int32Array.from([0, 2]),
      rowKeyGetter: (row: { id: number }) => row.id,
    };
    // 見えない行 4 が既に選ばれている。
    const { commands, args, actions, onRowSelectionChange } = setup({
      rowSelectionState: rowSelectionFromModel({ type: 'include', rowKeys: [4] }),
      filteredDataRows: filteredDataRows as unknown as RowSelectionCommandsArgs<Row>['filteredDataRows'],
    });
    commands.handleToggleSelectAllRows();
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'include', rowKeys: [4, 1, 3] });
    commands.update({ ...args, rowSelectionState: lastState(actions)! });
    commands.handleToggleSelectAllRows();
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'include', rowKeys: [4] });

    // フィルターの前に全選択していた(exclude)ときに外すと、見えない行の選択は残る。
    const all = setup({
      rowSelectionState: rowSelectionFromModel({ type: 'exclude', rowKeys: [] }),
      filteredDataRows: filteredDataRows as unknown as RowSelectionCommandsArgs<Row>['filteredDataRows'],
    });
    all.commands.handleToggleSelectAllRows();
    expect(all.onRowSelectionChange).toHaveBeenLastCalledWith({ type: 'exclude', rowKeys: [1, 3] });
  });

});