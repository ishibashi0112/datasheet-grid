// 追加(本体分解 E-4a): 列コマンド群の単体テストです(固定切替の幅書き戻し + 選択破棄 / 表示トグルの最後の 1 列
//   ガード / 並べ替え commit の no-op / 列リセットの初期スナップショット / ソートのトグル)。
import { describe, it, expect, vi } from 'vitest';
import { createColumnCommands, type ColumnCommandsArgs } from './columnCommands';
import type { GridColumn } from '../model/gridTypes.unbound';
import { gridActions, type GridUiAction } from '../model/gridActions';
import { createGridStore } from '../model/gridStore';
import { createInitialGridUiState } from '../model/gridReducer';

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

  // 追加(audit B-02): 視覚順の先頭が合成列(展開トグル / 行ドラッグ / 自動グループ列)でも、
  //   全解除は consumer の列を 1 本残す。
  it('全解除: 視覚順先頭が合成列でも consumer の最初の表示列を残す', () => {
    const commands = createColumnCommands<Row>();
    const synthetic: GridColumn<Row> = { key: '__ssg_detail_toggle__', title: '', width: 28 };
    const { args, onColumnsChange } = makeArgs({ orderedColumns: [synthetic, ...columns], visibleColumns: [synthetic, ...columns] });
    commands.update(args);
    commands.handleColumnChooserHideAll();
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    const next = onColumnsChange.mock.calls[0][0];
    expect(next.map((c) => c.key)).toEqual(['a', 'b', 'c']); // 合成列は混入しない
    expect(next.map((c) => c.visible !== false)).toEqual([true, false, false]); // a だけ残る
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

  // 追加(1.2.0 の確かめ直し H): 見出しのドラッグ / ツールパネルの順はペインごとに並べ直して届くが、グループ化の階層
  //   (グループ元の列どうしの順)はペインをまたいでも変えない。同じペインの中で入れ替えた順には従う。
  it('並べ替え commit: グループ元の列どうしの順はペインをまたいでも保ち、同じペインの中の入れ替えには従う', () => {
    type GroupRow = Record<string, string>;
    const grouped: GridColumn<GroupRow>[] = [
      { key: 'id', title: 'ID', width: 80, pinned: 'left' },
      { key: 'name', title: '名前', width: 100 },
      { key: 'team', title: 'チーム', width: 100, rowGroup: true },
      { key: 'dept', title: '部署', width: 100, rowGroup: true },
      { key: 'prio', title: '優先度', width: 100, pinned: 'left', rowGroup: true },
      { key: 'note', title: 'メモ', width: 100 },
    ];
    const commands = createColumnCommands<GroupRow>();
    const onColumnsChange = vi.fn<(next: GridColumn<GroupRow>[]) => void>();
    commands.update({
      ...(makeArgs().args as unknown as ColumnCommandsArgs<GroupRow>),
      columns: grouped,
      visibleColumns: grouped,
      orderedColumns: grouped,
      onColumnsChange,
    });
    const groupOrder = () =>
      onColumnsChange.mock.calls.at(-1)![0].filter((column) => column.rowGroup === true).map((column) => column.key);
    // 中央でメモを名前の前へ(見出しのドラッグの順 = 左固定 → 中央)。
    commands.applyColumnOrderAndPin(['id', 'prio', 'note', 'name', 'team', 'dept']);
    expect(onColumnsChange.mock.calls[0][0].filter((column) => column.rowGroup !== true).map((column) => column.key)).toEqual([
      'id',
      'note',
      'name',
    ]);
    expect(groupOrder()).toEqual(['team', 'dept', 'prio']);
    // 同じペインの中でグループ元の列を入れ替えた(ツールパネル)ときは、その順に従う。左固定の段はそのまま。
    commands.applyColumnOrderAndPin(['id', 'prio', 'name', 'dept', 'team', 'note']);
    expect(groupOrder()).toEqual(['dept', 'team', 'prio']);
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

  // 追加(audit B-06): columns を非同期に流し込む利用側(初回 [])でも、列が届いた最初の update で初期状態を取る。
  it('列リセット: 初回 columns が空なら、列が届いた最初の update で初期状態を取る', () => {
    const commands = createColumnCommands<Row>();
    const { args, onColumnsChange } = makeArgs({ columns: [], visibleColumns: [], orderedColumns: [] });
    commands.update(args);
    expect(commands.getInitialColumnState()).toBeNull();
    commands.update({ ...args, columns, visibleColumns: columns, orderedColumns: columns });
    expect(commands.getInitialColumnState()?.get('b')).toEqual({ width: 100, pinned: undefined, visible: undefined });
    const changed: GridColumn<Row>[] = [columns[0], { ...columns[1], visible: false }, columns[2]];
    commands.update({ ...args, columns: changed, visibleColumns: [columns[0], columns[2]], orderedColumns: [columns[0], columns[2]] });
    commands.handleColumnChooserReset();
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    expect(onColumnsChange.mock.calls[0][0][1].visible).toBeUndefined();
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

  // 追加(差し込み式 段階 2): 列幅の自動調整の機能が無い構成(runAutosize = undefined)。
  describe('runAutosize が無いとき', () => {
    const pointer = (timeStamp: number, clientX = 100) => ({
      timeStamp,
      clientX,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    it('境界のダブルクリックで、ある構成は自動調整し、無い構成は 2 回目も通常のリサイズを始める', () => {
      const withAutosize = createColumnCommands<Row>();
      const a = makeArgs();
      withAutosize.update(a.args);
      withAutosize.handleColumnResizePointerDown(columns[0], pointer(1000));
      withAutosize.handleColumnResizePointerDown(columns[0], pointer(1100));
      expect(a.args.runAutosize).toHaveBeenCalledTimes(1);
      expect(a.actions.filter((action) => action.type === 'column/resizeStart')).toHaveLength(1);

      const withoutAutosize = createColumnCommands<Row>();
      const b = makeArgs({ runAutosize: undefined });
      withoutAutosize.update(b.args);
      withoutAutosize.handleColumnResizePointerDown(columns[0], pointer(1000));
      withoutAutosize.handleColumnResizePointerDown(columns[0], pointer(1100));
      expect(b.actions.filter((action) => action.type === 'column/resizeStart')).toHaveLength(2);
    });

    it('列メニューの自動調整を呼んでもメニューを閉じるだけで落ちない', () => {
      const commands = createColumnCommands<Row>();
      const { args } = makeArgs({ runAutosize: undefined });
      commands.update(args);
      commands.handleColumnMenuAutosizeColumn('a');
      commands.handleColumnMenuAutosizeAllColumns();
      expect(args.closeColumnMenu).toHaveBeenCalledTimes(2);
    });
  });

  // 追加(1.3.0 / Solid 版の品質の段 2 S12-01): 列を変えた後、アクティブセルは列のキーに付いていく(隠した列なら同じ位置)。
  it('固定・並べ替え・非表示の後、新しい列が届いたらアクティブセルをその列の位置へ移す(グループ化は今までどおり外す)', () => {
    const store = createGridStore(createInitialGridUiState());
    const commands = createColumnCommands<Row>();
    const onColumnsChange = vi.fn<(next: GridColumn<Row>[]) => void>();
    const make = (cols: GridColumn<Row>[]): ColumnCommandsArgs<Row> => {
      const visible = cols.filter((column) => column.visible !== false);
      const ordered = [
        ...visible.filter((column) => column.pinned === 'left'),
        ...visible.filter((column) => column.pinned !== 'left' && column.pinned !== 'right'),
        ...visible.filter((column) => column.pinned === 'right'),
      ];
      return {
        ...makeArgs().args,
        columns: cols,
        visibleColumns: visible,
        orderedColumns: ordered,
        onColumnsChange,
        dispatch: store.dispatch,
        getUiState: store.getState,
      };
    };
    const four: GridColumn<Row>[] = [...columns, { key: 'd', title: 'D', width: 100 }];
    commands.update(make(four));
    store.dispatch(gridActions.activateCell({ row: 3, col: 2 }));
    // c を左に固定 → c は 0 列目。
    commands.handleColumnMenuPinnedChange('c', 'left');
    expect(store.getState().activeCell).toEqual({ row: 3, col: 2 });
    commands.update(make(onColumnsChange.mock.calls[0][0]));
    expect(store.getState().activeCell).toEqual({ row: 3, col: 0 });
    expect(store.getState().selection).toEqual({ type: 'cell', range: { start: { row: 3, col: 0 }, end: { row: 3, col: 0 } } });
    // 並びは c / a / b / d。b へ移ってからアクティブでない列 a を隠すと、b(1 列目)に付いていく。
    const pinned = onColumnsChange.mock.calls[0][0];
    store.dispatch(gridActions.activateCell({ row: 3, col: 2 }));
    commands.handleColumnChooserToggleVisibility('a', false);
    commands.update(make(onColumnsChange.mock.calls[1][0]));
    expect(store.getState().activeCell).toEqual({ row: 3, col: 1 });
    // アクティブな列(b)を隠すと同じ位置のまま(1 列目 = d)。
    const hidden = onColumnsChange.mock.calls[1][0];
    commands.handleColumnChooserToggleVisibility('b', false);
    commands.update(make(onColumnsChange.mock.calls[2][0]));
    expect(store.getState().activeCell).toEqual({ row: 3, col: 1 });
    expect(pinned).not.toBe(hidden);
    // 新しい列が届かないまま(親が columns を変えない)の update では動かさない。
    store.dispatch(gridActions.activateCell({ row: 1, col: 0 }));
    commands.handleColumnChooserShowAll();
    commands.update(make(onColumnsChange.mock.calls[2][0]));
    expect(store.getState().activeCell).toEqual({ row: 1, col: 0 });
    // グループ化はアクティブセルを外す(行が入れ替わる)。
    commands.handleColumnMenuGroupBy('c');
    expect(store.getState().activeCell).toBeNull();
  });
});