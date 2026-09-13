// 追加(本体分解 E-4a): 列コマンド群の単体テストです(固定切替の幅書き戻し + 選択破棄 / 表示トグルの最後の 1 列
//   ガード / 並べ替え commit の no-op / 列リセットの初期スナップショット / ソートのトグル)。
import { describe, it, expect, vi } from 'vitest';
import { createColumnCommands, type ColumnCommandsArgs } from './columnCommands';
import type { GridColumn } from '../model/gridTypes';
import type { GridUiAction } from '../model/gridActions';

type Row = { a: number; b: number; c: number };

const columns: GridColumn<Row>[] = [
  { key: 'a', title: 'A', width: 100 },
  { key: 'b', title: 'B', width: 100 },
  { key: 'c', title: 'C', width: 100 },
];

const makeArgs = (overrides: Partial<ColumnCommandsArgs<Row>> = {}) => {
  const actions: GridUiAction[] = [];
  const onColumnsChange = vi.fn<(next: GridColumn<Row>[]) => void>();
  const args: ColumnCommandsArgs<Row> = {
    columns,
    visibleColumns: columns,
    orderedColumns: columns,
    columnWidths: {},
    onColumnsChange,
    dispatch: (action) => {
      actions.push(action);
    },
    enableSorting: true,
    sort: [],
    globalFilterText: '',
    closeColumnMenu: vi.fn(),
    openToolPanel: vi.fn(),
    openColumnFilterPopover: vi.fn(),
    runAutosize: vi.fn(),
    ...overrides,
  };
  return { args, actions, onColumnsChange };
};

const discardTypes = ['edit/stop', 'selection/clear', 'cell/activate'];

describe('createColumnCommands', () => {
  it('固定切替: 解決済み幅を defs へ書き戻して onColumnsChange し、選択 / 編集を破棄する。同値は no-op', () => {
    const commands = createColumnCommands<Row>();
    const { args, actions, onColumnsChange } = makeArgs({ columnWidths: { b: 150 } });
    commands.update(args);
    commands.handleColumnMenuPinnedChange('a', 'left');
    expect(args.closeColumnMenu).toHaveBeenCalledTimes(1);
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    const next = onColumnsChange.mock.calls[0][0];
    expect(next[0]).toEqual({ ...columns[0], pinned: 'left' });
    expect(next[1]).toEqual({ ...columns[1], width: 150 });
    expect(next[2]).toBe(columns[2]);
    expect(actions.map((action) => action.type)).toEqual(discardTypes);

    commands.handleColumnMenuPinnedChange('b', undefined);
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
  });

  it('表示トグル: 最後の 1 列は非表示にできず、onColumnsChange 未指定では何もしない', () => {
    const commands = createColumnCommands<Row>();
    const only: GridColumn<Row>[] = [columns[0], { ...columns[1], visible: false }];
    const { args, onColumnsChange } = makeArgs({ columns: only, visibleColumns: [only[0]], orderedColumns: [only[0]] });
    commands.update(args);
    commands.handleColumnChooserToggleVisibility('a', false);
    expect(onColumnsChange).not.toHaveBeenCalled();
    commands.handleColumnChooserShowAll();
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    expect(onColumnsChange.mock.calls[0][0][1].visible).toBe(true);

    const uncontrolled = createColumnCommands<Row>();
    const second = makeArgs({ onColumnsChange: undefined });
    uncontrolled.update(second.args);
    uncontrolled.handleColumnChooserHideAll();
    expect(second.actions).toEqual([]);
  });

  it('並べ替え commit: 集合不一致 / 順序・幅・pinned が同一なら no-op、pinOverride は pane 連結正規化される', () => {
    const commands = createColumnCommands<Row>();
    const { args, onColumnsChange } = makeArgs();
    commands.update(args);
    commands.applyColumnOrderAndPin(['a', 'b']);
    commands.applyColumnOrderAndPin(['a', 'b', 'zzz']);
    commands.applyColumnOrderAndPin(['a', 'b', 'c']);
    expect(onColumnsChange).not.toHaveBeenCalled();
    commands.applyColumnOrderAndPin(['a', 'b', 'c'], new Map([['c', 'left']]));
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    expect(onColumnsChange.mock.calls[0][0].map((column) => column.key)).toEqual(['c', 'a', 'b']);
  });

  it('列リセット: 最初の update で退避した初期状態へ戻す(以後の columns 変化では更新しない)', () => {
    const commands = createColumnCommands<Row>();
    const { args, onColumnsChange } = makeArgs();
    commands.update(args);
    expect(commands.getInitialColumnState()?.get('a')).toEqual({ width: 100, pinned: undefined, visible: undefined });
    // ユーザー操作後(b を非表示・幅変更)の columns で update しても初期状態は不変。
    const changed: GridColumn<Row>[] = [columns[0], { ...columns[1], visible: false }, columns[2]];
    commands.update({ ...args, columns: changed, columnWidths: { a: 180 } });
    expect(commands.getInitialColumnState()?.get('b')?.visible).toBeUndefined();
    commands.handleColumnChooserReset();
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    const reset = onColumnsChange.mock.calls[0][0];
    expect(reset.map((column) => column.key)).toEqual(['a', 'b', 'c']);
    expect(reset[0].width).toBe(100);
    expect(reset[1].visible).toBeUndefined();
  });

  it('ソート: 同じ列・同方向の再選択は解除、管理パネルの追加は setSort、enableSorting=false では無視', () => {
    const commands = createColumnCommands<Row>();
    const { args, actions } = makeArgs({ sort: [{ columnKey: 'a', direction: 'asc' }] });
    commands.update(args);
    commands.handleColumnMenuSortChange('a', 'asc');
    expect(actions.map((action) => action.type)).toEqual(['sort/clear']);
    actions.length = 0;
    commands.handleSortManagerAddLevel('b', 'desc');
    expect(actions).toEqual([
      {
        type: 'sort/set',
        entries: [
          { columnKey: 'a', direction: 'asc' },
          { columnKey: 'b', direction: 'desc' },
        ],
      },
    ]);
    actions.length = 0;
    commands.update({ ...args, enableSorting: false });
    commands.handleSortManagerClearAll();
    expect(actions).toEqual([]);
  });
});