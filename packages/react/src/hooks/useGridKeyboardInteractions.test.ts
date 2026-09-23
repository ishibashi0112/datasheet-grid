// 追加(非依存化 ③-7): useGridKeyboardInteractions の特性テストです(抽出前に現状の挙動を固定)。
//   キー → アクション / コールバックの写像を、合成イベント相当のオブジェクトで検証します。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { useGridKeyboardInteractions } from './useGridKeyboardInteractions';
import { createInitialGridUiState } from '@ishibashi0112/spreadsheet-grid-core/model/gridReducer';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/model/gridActions';
import type { CellCoord, GridColumn, GridUiState, RowModel } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; done: boolean };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 100 },
  { key: 'done', title: '完了', width: 60, editor: { type: 'checkbox' } },
];
const rows: Row[] = [
  { id: 1, name: 'a', done: false },
  { id: 2, name: 'b', done: true },
  { id: 3, name: 'c', done: false },
];
const rowModel: RowModel<Row> = {
  getRow: (i) => rows[i],
  getRowCount: () => rows.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};

const keyEvent = (key: string, init: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean }> = {}) =>
  ({
    key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    nativeEvent: { isComposing: init.isComposing ?? false },
    target: null,
    preventDefault: vi.fn(),
  }) as unknown as KeyboardEvent<HTMLDivElement>;

const setup = (overrides: Partial<{ activeCell: CellCoord | null; editingCell: CellCoord | null; readOnly: boolean; isWholeGridSelected: boolean; enableClearOnDelete: boolean }> = {}) => {
  const uiState: GridUiState = {
    ...createInitialGridUiState(columns),
    activeCell: overrides.activeCell === undefined ? { row: 1, col: 0 } : overrides.activeCell,
    editingCell: overrides.editingCell ?? null,
  };
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const cb = {
    setEditorInitialValue: vi.fn(),
    handleCopy: vi.fn(async () => {}),
    handleCellDoubleClick: vi.fn(),
    selectEntireGrid: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClearSelection: vi.fn(),
    onToggleCheckboxCell: vi.fn(),
    onToggleGroup: vi.fn(),
  };
  const view = renderHook(() =>
    useGridKeyboardInteractions<Row>({
      uiState,
      rowModel,
      visibleColumns: columns,
      readOnly: overrides.readOnly ?? false,
      canEditCell: undefined,
      dispatch,
      isWholeGridSelected: overrides.isWholeGridSelected ?? false,
      enableClearOnDelete: overrides.enableClearOnDelete ?? true,
      ...cb,
    }),
  );
  return { ...view, dispatch, ...cb };
};
const types = (dispatch: ReturnType<typeof vi.fn<(a: GridUiAction) => void>>) =>
  dispatch.mock.calls.map(([a]) => a.type);

describe('useGridKeyboardInteractions(特性テスト)', () => {
  it('矢印 / Tab で active cell を移動(Shift で範囲拡張)、Escape で選択解除', async () => {
    const t = setup();
    await act(async () => {
      await t.result.current.handleKeyDown(keyEvent('ArrowDown'));
    });
    expect(types(t.dispatch)).toEqual(['selection/start', 'selection/end', 'cell/activate']);
    expect(t.dispatch.mock.calls[2][0]).toMatchObject({ cell: { row: 2, col: 0 } });
    t.dispatch.mockClear();
    await act(async () => {
      await t.result.current.handleKeyDown(keyEvent('ArrowRight', { shiftKey: true }));
    });
    expect(types(t.dispatch)).toEqual(['selection/start', 'selection/update', 'selection/end', 'cell/activate']);
    t.dispatch.mockClear();
    await act(async () => {
      await t.result.current.handleKeyDown(keyEvent('Tab', { shiftKey: true }));
      await t.result.current.handleKeyDown(keyEvent('Escape'));
    });
    // Tab(Shift)は col 0 で clamp → row 1 / col 0 のまま activate。Escape は clearSelection。
    expect(types(t.dispatch)).toEqual(['selection/start', 'selection/end', 'cell/activate', 'selection/clear']);
  });

  it('Ctrl+C / Ctrl+A / Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Delete のショートカット', async () => {
    const t = setup();
    await act(async () => {
      await t.result.current.handleKeyDown(keyEvent('c', { ctrlKey: true }));
      await t.result.current.handleKeyDown(keyEvent('a', { metaKey: true }));
      await t.result.current.handleKeyDown(keyEvent('z', { ctrlKey: true }));
      await t.result.current.handleKeyDown(keyEvent('Z', { ctrlKey: true, shiftKey: true }));
      await t.result.current.handleKeyDown(keyEvent('y', { ctrlKey: true }));
      await t.result.current.handleKeyDown(keyEvent('Delete'));
      // IME 変換中の Ctrl+Z は無視。
      await t.result.current.handleKeyDown(keyEvent('z', { ctrlKey: true, isComposing: true }));
    });
    expect(t.handleCopy).toHaveBeenCalledTimes(1);
    expect(t.selectEntireGrid).toHaveBeenCalledTimes(1);
    expect(t.onUndo).toHaveBeenCalledTimes(1);
    expect(t.onRedo).toHaveBeenCalledTimes(2);
    expect(t.onClearSelection).toHaveBeenCalledTimes(1);

    const whole = setup({ isWholeGridSelected: true });
    await act(async () => {
      await whole.result.current.handleKeyDown(keyEvent('a', { ctrlKey: true }));
    });
    expect(types(whole.dispatch)).toEqual(['selection/clear', 'cell/activate']);
    expect(whole.selectEntireGrid).not.toHaveBeenCalled();
  });

  it('Enter / F2 は編集開始のダブルクリック相当、印字キーは初期値付きで startEdit、checkbox 列は Space でトグル', async () => {
    const t = setup();
    await act(async () => {
      await t.result.current.handleKeyDown(keyEvent('F2'));
      await t.result.current.handleKeyDown(keyEvent('x'));
    });
    expect(t.handleCellDoubleClick).toHaveBeenCalledWith({ row: 1, col: 0 });
    expect(t.setEditorInitialValue).toHaveBeenCalledWith('x');
    expect(types(t.dispatch)).toEqual(['edit/start']);

    const chk = setup({ activeCell: { row: 0, col: 1 } });
    await act(async () => {
      await chk.result.current.handleKeyDown(keyEvent(' '));
      await chk.result.current.handleKeyDown(keyEvent('x'));
    });
    expect(chk.onToggleCheckboxCell).toHaveBeenCalledTimes(1);
    expect(chk.setEditorInitialValue).not.toHaveBeenCalled();
  });

  it('編集中 / readOnly / active なしでは何もしない', async () => {
    const editing = setup({ editingCell: { row: 1, col: 0 } });
    await act(async () => {
      await editing.result.current.handleKeyDown(keyEvent('ArrowDown'));
    });
    expect(editing.dispatch).not.toHaveBeenCalled();

    const ro = setup({ readOnly: true });
    await act(async () => {
      await ro.result.current.handleKeyDown(keyEvent('x'));
    });
    expect(ro.dispatch).not.toHaveBeenCalled();

    const none = setup({ activeCell: null });
    await act(async () => {
      await none.result.current.handleKeyDown(keyEvent('Enter'));
      await none.result.current.handleKeyDown(keyEvent('x'));
    });
    expect(none.handleCellDoubleClick).not.toHaveBeenCalled();
    expect(none.dispatch).not.toHaveBeenCalled();
  });
});
// 追加(label-row ③): ラベル行(getLabelRow)は縦移動で読み飛ばします。
describe('useGridKeyboardInteractions × ラベル行', () => {
  // [L] a [L] [L] b [L]
  type LRow = { id: number; kind?: 'label'; name: string; done: boolean };
  const labelRows: LRow[] = [
    { id: 10, kind: 'label', name: 'S1', done: false },
    { id: 1, name: 'a', done: false },
    { id: 11, kind: 'label', name: 'S2', done: false },
    { id: 12, kind: 'label', name: 'S3', done: false },
    { id: 2, name: 'b', done: false },
    { id: 13, kind: 'label', name: 'S4', done: false },
  ];
  const labelRowModel: RowModel<LRow> = {
    getRowCount: () => labelRows.length,
    getRow: (i) => (labelRows[i]?.kind === 'label' ? (undefined as unknown as LRow) : labelRows[i]),
    getSourceIndex: (i) => (labelRows[i]?.kind === 'label' ? (undefined as unknown as number) : i),
    getRowKey: (i) => labelRows[i]?.id ?? i,
    getLabelRow: (i) =>
      labelRows[i]?.kind === 'label'
        ? { kind: 'label', row: labelRows[i], sourceIndex: i, label: labelRows[i].name, sectionRowCount: 0 }
        : undefined,
  };
  const setupLabel = (activeCell: CellCoord) => {
    const uiState: GridUiState = { ...createInitialGridUiState(columns as unknown as GridColumn<LRow>[]), activeCell };
    const dispatch = vi.fn<(a: GridUiAction) => void>();
    const view = renderHook(() =>
      useGridKeyboardInteractions<LRow>({
        uiState,
        rowModel: labelRowModel,
        visibleColumns: columns as unknown as GridColumn<LRow>[],
        readOnly: false,
        canEditCell: undefined,
        dispatch,
        isWholeGridSelected: false,
        enableClearOnDelete: true,
        setEditorInitialValue: vi.fn(),
        handleCopy: vi.fn(async () => {}),
        handleCellDoubleClick: vi.fn(),
        selectEntireGrid: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onClearSelection: vi.fn(),
        onToggleCheckboxCell: vi.fn(),
        onToggleGroup: vi.fn(),
      }),
    );
    return { ...view, dispatch };
  };

  it('ArrowDown / ArrowUp は連続するラベル行を飛ばして次のデータ行へ移り、端までラベル行なら留まる', async () => {
    const down = setupLabel({ row: 1, col: 0 });
    await act(async () => {
      await down.result.current.handleKeyDown(keyEvent('ArrowDown'));
    });
    expect(down.dispatch.mock.calls[2][0]).toMatchObject({ cell: { row: 4, col: 0 } });
    const up = setupLabel({ row: 4, col: 0 });
    await act(async () => {
      await up.result.current.handleKeyDown(keyEvent('ArrowUp'));
    });
    expect(up.dispatch.mock.calls[2][0]).toMatchObject({ cell: { row: 1, col: 0 } });
    // 末尾側はラベル行のみ → 留まる。
    const stay = setupLabel({ row: 4, col: 0 });
    await act(async () => {
      await stay.result.current.handleKeyDown(keyEvent('ArrowDown'));
    });
    expect(stay.dispatch.mock.calls[2][0]).toMatchObject({ cell: { row: 4, col: 0 } });
    // 横移動はラベル行に無関係。
    const right = setupLabel({ row: 1, col: 0 });
    await act(async () => {
      await right.result.current.handleKeyDown(keyEvent('ArrowRight'));
    });
    expect(right.dispatch.mock.calls[2][0]).toMatchObject({ cell: { row: 1, col: 1 } });
  });
});
