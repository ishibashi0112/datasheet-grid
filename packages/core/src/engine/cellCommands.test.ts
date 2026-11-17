// 追加(Solid 版 段階 0-2): セルの操作のコマンド群(engine/cellCommands)のテストです。React 版の結合テスト
//   (ダブルクリック / Enter / F2 / Delete / Ctrl+A / チェックボックス / renderCell の setValue)が同じ動きを広く見ているので、
//   こちらは判断の分かれ目(書き換えてよいか・チェックボックス列・reject の列・serverSide・イベントの時点の状態)を固定します。
import { describe, expect, it, vi } from 'vitest';
import { createCellCommands, type CellCommandsArgs } from './cellCommands';
import { createGridStore } from '../model/gridStore';
import { createInitialGridUiState } from '../model/gridReducer';
import { gridActions } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '../logic/rowReorder';

type Row = { id: number; name: string; done: boolean; qty: number };

const rows: Row[] = [
  { id: 1, name: 'a', done: false, qty: 1 },
  { id: 2, name: 'b', done: true, qty: 2 },
  { id: 3, name: 'c', done: false, qty: 3 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 100 },
  { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
  {
    key: 'qty',
    title: '数',
    width: 60,
    editor: { type: 'number' },
    validationMode: 'reject',
    validate: ({ value }) => (typeof value === 'number' && value < 0 ? '0 以上' : true),
  },
];

// 表示は逆順(ソートした形)。view index → 元の index は 2, 1, 0。
const order = [2, 1, 0];
const rowModel: RowModel<Row> = {
  // 範囲の外は undefined(型は RowModel に合わせる)。
  getRow: (i) => rows[order[i] ?? -1] as Row,
  getRowCount: () => order.length,
  getSourceIndex: (i) => order[i],
  getRowKey: (i) => rows[order[i] ?? -1]?.id ?? i,
};

const setup = (overrides: Partial<CellCommandsArgs<Row>> = {}) => {
  const store = createGridStore(createInitialGridUiState());
  const commands = createCellCommands<Row>();
  const handleRowsChange = vi.fn<(next: Row[]) => void>();
  const startEditWithValue = vi.fn();
  const args: CellCommandsArgs<Row> = {
    rows,
    rowModel,
    orderedColumns: columns,
    uiState: store.getState(),
    getUiState: store.getState,
    readOnly: false,
    canEditCell: undefined,
    handleRowsChange,
    applyServerSideCellEdits: undefined,
    startEditWithValue,
    dispatch: store.dispatch,
    ...overrides,
  };
  commands.update(args);
  return { store, commands, handleRowsChange, startEditWithValue, args };
};

describe('cellCommands', () => {
  it('update の前は何もしない', () => {
    const commands = createCellCommands<Row>();
    expect(commands.tryStartEdit({ row: 0, col: 0 })).toBe(false);
    commands.toggleCheckbox({ row: 0, col: 1 });
    commands.clearSelectedCells();
    commands.selectEntireGrid();
  });

  it('tryStartEdit: 今の値を初期値に始める。読み取り専用 / canEditCell / チェックボックス列 / 範囲の外は始めない', () => {
    const t = setup();
    expect(t.commands.tryStartEdit({ row: 0, col: 2 })).toBe(true);
    expect(t.startEditWithValue).toHaveBeenCalledWith({ row: 0, col: 2 }, '3');
    expect(t.commands.tryStartEdit({ row: 0, col: 1 })).toBe(false);
    expect(t.commands.tryStartEdit({ row: 9, col: 0 })).toBe(false);
    expect(t.commands.tryStartEdit({ row: 0, col: 9 })).toBe(false);

    const readOnly = setup({ readOnly: true });
    expect(readOnly.commands.tryStartEdit({ row: 0, col: 0 })).toBe(false);
    // canEditCell の rowIndex はビュー行の index。
    const canEditCell = vi.fn((rowIndex: number) => rowIndex !== 1);
    const guarded = setup({ canEditCell });
    expect(guarded.commands.tryStartEdit({ row: 1, col: 0 })).toBe(false);
    expect(guarded.commands.tryStartEdit({ row: 2, col: 0 })).toBe(true);
    expect(guarded.startEditWithValue).toHaveBeenCalledWith({ row: 2, col: 0 }, 'a');
    expect(readOnly.startEditWithValue).not.toHaveBeenCalled();
  });

  it('toggleCheckbox: 元の行へ切り替えた値を書く。チェックボックス列でなければ / 読み取り専用なら書かない', () => {
    const t = setup();
    t.commands.toggleCheckbox({ row: 1, col: 1 });
    expect(t.handleRowsChange).toHaveBeenCalledTimes(1);
    expect(t.handleRowsChange.mock.calls[0]?.[0]?.[1]?.done).toBe(false);
    t.commands.toggleCheckbox({ row: 1, col: 0 });
    expect(t.handleRowsChange).toHaveBeenCalledTimes(1);
    const readOnly = setup({ readOnly: true });
    readOnly.commands.toggleCheckbox({ row: 1, col: 1 });
    expect(readOnly.handleRowsChange).not.toHaveBeenCalled();
  });

  it('writeCellValue: reject の列の NG は書かない。serverSide は書き戻しへ流す', () => {
    const t = setup();
    const row = rows[2] as Row;
    t.commands.writeCellValue(0, row, columns[2] as GridColumn<Row>, -1);
    expect(t.handleRowsChange).not.toHaveBeenCalled();
    t.commands.writeCellValue(0, row, columns[2] as GridColumn<Row>, 5);
    expect(t.handleRowsChange.mock.calls[0]?.[0]?.[2]?.qty).toBe(5);

    const applyServerSideCellEdits = vi.fn(() => 1);
    const server = setup({ applyServerSideCellEdits });
    server.commands.writeCellValue(0, row, columns[0] as GridColumn<Row>, 'z');
    expect(applyServerSideCellEdits).toHaveBeenCalledWith([{ viewIndex: 0, column: columns[0], value: 'z' }]);
    expect(server.handleRowsChange).not.toHaveBeenCalled();
  });

  it('clearSelectedCells: イベントの時点の選択を消す。変わらなければ書かない', () => {
    const t = setup();
    // update の後に選んだ範囲(描き直しの前)も読む。
    t.store.dispatch(gridActions.startSelection({ row: 0, col: 0 }));
    t.store.dispatch(gridActions.updateSelection({ row: 1, col: 0 }));
    t.store.dispatch(gridActions.endSelection());
    t.store.dispatch(gridActions.activateCell({ row: 0, col: 0 }));
    t.commands.clearSelectedCells();
    expect(t.handleRowsChange).toHaveBeenCalledTimes(1);
    const next = t.handleRowsChange.mock.calls[0]?.[0] ?? [];
    expect(next.map((row) => row.name)).toEqual(['a', '', '']);

    const empty = setup({ rows: rows.map((row) => ({ ...row, name: '' })) });
    empty.store.dispatch(gridActions.activateCell({ row: 0, col: 0 }));
    empty.commands.clearSelectedCells();
    expect(empty.handleRowsChange).not.toHaveBeenCalled();
  });

  it('selectEntireGrid: 表の全体を選び、アクティブセルは合成列を飛ばした最初のデータのセル', () => {
    const withHandle: GridColumn<Row>[] = [{ key: ROW_DRAG_HANDLE_COLUMN_KEY, title: '', width: 24 }, ...columns];
    const t = setup({ orderedColumns: withHandle });
    t.commands.selectEntireGrid();
    const state = t.store.getState();
    expect(state.selection).toEqual({
      type: 'cell',
      range: { start: { row: 0, col: 0 }, end: { row: 2, col: 3 } },
    });
    expect(state.activeCell).toEqual({ row: 0, col: 1 });
  });
});