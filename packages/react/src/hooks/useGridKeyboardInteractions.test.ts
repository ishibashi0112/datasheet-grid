// 追加(非依存化 ③-7): useGridKeyboardInteractions の特性テストです(抽出前に現状の挙動を固定)。
//   キー → アクション / コールバックの写像を、合成イベント相当のオブジェクトで検証します。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { useGridKeyboardInteractions } from './useGridKeyboardInteractions';
import { createInitialGridUiState } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridReducer';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridActions';
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
    ...createInitialGridUiState(),
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
      await t.result.current.handleKeyDown(keyEvent('Tab'));
      await t.result.current.handleKeyDown(keyEvent('Escape'));
    });
    // Shift+Tab は col 0(先頭列)なので何もしない = 既定動作でグリッド外へ(監査 C-5)。
    // Tab は col 1 へ移動して activate。Escape は clearSelection。
    expect(types(t.dispatch)).toEqual(['selection/start', 'selection/end', 'cell/activate', 'selection/clear']);
    expect(t.dispatch.mock.calls[2][0]).toMatchObject({ cell: { row: 1, col: 1 } });
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
      await none.result.current.handleKeyDown(keyEvent('x'));
    });
    expect(none.handleCellDoubleClick).not.toHaveBeenCalled();
    expect(none.dispatch).not.toHaveBeenCalled();
    // 変更(dogfood DU-16): active なしの Enter は先頭のセルに止まるだけ(編集は始めない)。
    await act(async () => {
      await none.result.current.handleKeyDown(keyEvent('Enter'));
    });
    expect(none.handleCellDoubleClick).not.toHaveBeenCalled();
    expect(none.dispatch).toHaveBeenLastCalledWith({ type: 'cell/activate', cell: { row: 0, col: 0 } });
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
    const uiState: GridUiState = { ...createInitialGridUiState(), activeCell };
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


// 追加(dogfood DU-01 / DU-16): 端 / 1 画面ぶんの移動と、アクティブセルが無いときの最初のキー。
describe('useGridKeyboardInteractions × 端 / ページの移動(dogfood)', () => {
  // 先頭は展開トグル列(操作用の合成列)。[L] は行 0 と行 29(ラベル行)。
  type PRow = { id: number; kind?: 'label'; a: string; b: string; c: string };
  const pageRows: PRow[] = Array.from({ length: 30 }, (_, i) =>
    i === 0 || i === 29 ? { id: i, kind: 'label', a: `L${i}`, b: '', c: '' } : { id: i, a: `a${i}`, b: `b${i}`, c: `c${i}` },
  );
  const pageColumns: GridColumn<PRow>[] = [
    { key: '__ssg_detail_toggle__', title: '', width: 28 },
    { key: 'a', title: 'A', width: 80 },
    { key: 'b', title: 'B', width: 80 },
    { key: 'c', title: 'C', width: 80 },
  ];
  const pageRowModel: RowModel<PRow> = {
    getRowCount: () => pageRows.length,
    getRow: (i) => pageRows[i],
    getSourceIndex: (i) => i,
    getRowKey: (i) => pageRows[i]?.id ?? i,
    getLabelRow: (i) =>
      pageRows[i]?.kind === 'label'
        ? { kind: 'label', row: pageRows[i], sourceIndex: i, label: pageRows[i].a, sectionRowCount: 0 }
        : undefined,
  };
  const setupPage = (
    activeCell: CellCoord | null,
    extra: Partial<{
      selection: GridUiState['selection'];
      resolvePageRow: (row: number, direction: 1 | -1) => number;
      rowModel: RowModel<PRow>;
    }> = {},
  ) => {
    const uiState: GridUiState = { ...createInitialGridUiState(), activeCell, selection: extra.selection ?? null };
    const dispatch = vi.fn<(a: GridUiAction) => void>();
    const handleCellDoubleClick = vi.fn();
    const view = renderHook(() =>
      useGridKeyboardInteractions<PRow>({
        uiState,
        rowModel: extra.rowModel ?? pageRowModel,
        visibleColumns: pageColumns,
        readOnly: false,
        canEditCell: undefined,
        dispatch,
        isWholeGridSelected: false,
        enableClearOnDelete: true,
        setEditorInitialValue: vi.fn(),
        handleCopy: vi.fn(async () => {}),
        handleCellDoubleClick,
        selectEntireGrid: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onClearSelection: vi.fn(),
        onToggleCheckboxCell: vi.fn(),
        onToggleGroup: vi.fn(),
        resolvePageRow: extra.resolvePageRow,
      }),
    );
    const press = async (key: string, init: Parameters<typeof keyEvent>[1] = {}) => {
      dispatch.mockClear();
      const event = keyEvent(key, init);
      await act(async () => {
        await view.result.current.handleKeyDown(event);
      });
      return event;
    };
    const lastActivated = () => {
      const calls = dispatch.mock.calls.filter(([a]) => a.type === 'cell/activate');
      return (calls[calls.length - 1]?.[0] as { cell?: CellCoord } | undefined)?.cell;
    };
    return { ...view, dispatch, handleCellDoubleClick, press, lastActivated };
  };

  it('Ctrl / ⌘ + 矢印はその向きの端(行はラベル行を、先頭の列は操作用の合成列を飛ばす)', async () => {
    const t = setupPage({ row: 5, col: 2 });
    const down = await t.press('ArrowDown', { ctrlKey: true });
    expect(down.preventDefault).toHaveBeenCalled();
    expect(t.lastActivated()).toEqual({ row: 28, col: 2 });
    await t.press('ArrowUp', { metaKey: true });
    expect(t.lastActivated()).toEqual({ row: 1, col: 2 });
    await t.press('ArrowLeft', { ctrlKey: true });
    expect(t.lastActivated()).toEqual({ row: 5, col: 1 });
    await t.press('ArrowRight', { ctrlKey: true });
    expect(t.lastActivated()).toEqual({ row: 5, col: 3 });
  });

  it('Home / End は行の先頭 / 末尾の列、Ctrl+Home / Ctrl+End は先頭 / 末尾のセル。Shift で範囲を広げる', async () => {
    const t = setupPage({ row: 5, col: 2 });
    await t.press('Home');
    expect(t.lastActivated()).toEqual({ row: 5, col: 1 });
    await t.press('End');
    expect(t.lastActivated()).toEqual({ row: 5, col: 3 });
    await t.press('Home', { ctrlKey: true });
    expect(t.lastActivated()).toEqual({ row: 1, col: 1 });
    await t.press('End', { ctrlKey: true, shiftKey: true });
    expect(types(t.dispatch)).toEqual(['selection/start', 'selection/update', 'selection/end', 'cell/activate']);
    expect(t.dispatch.mock.calls[0][0]).toMatchObject({ cell: { row: 5, col: 2 } });
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 28, col: 3 } });
  });

  it('PageDown / PageUp は resolvePageRow の行へ(ラベル行は飛ばす・少なくとも 1 行・端で止まる)。未指定なら 10 行', async () => {
    const t = setupPage({ row: 5, col: 2 }, { resolvePageRow: (row, direction) => row + direction * 12 });
    await t.press('PageDown');
    expect(t.lastActivated()).toEqual({ row: 17, col: 2 });
    await t.press('PageUp');
    expect(t.lastActivated()).toEqual({ row: 1, col: 2 });
    const end = setupPage({ row: 25, col: 1 }, { resolvePageRow: (row, direction) => row + direction * 12 });
    await end.press('PageDown');
    // 行 29 はラベル行なので、その手前の 28。
    expect(end.lastActivated()).toEqual({ row: 28, col: 1 });
    const tall = setupPage({ row: 5, col: 1 }, { resolvePageRow: (row) => row });
    await tall.press('PageDown');
    expect(tall.lastActivated()).toEqual({ row: 6, col: 1 });
    const plain = setupPage({ row: 5, col: 1 });
    await plain.press('PageDown');
    expect(plain.lastActivated()).toEqual({ row: 15, col: 1 });
  });

  it('Shift で広げるときは範囲の終わりから動かす(ドラッグで選んだ範囲を縮めない)', async () => {
    const t = setupPage(
      { row: 2, col: 1 },
      { selection: { type: 'cell', range: { start: { row: 2, col: 1 }, end: { row: 6, col: 3 } } } },
    );
    await t.press('ArrowDown', { shiftKey: true });
    expect(t.dispatch.mock.calls[0][0]).toMatchObject({ type: 'selection/start', cell: { row: 2, col: 1 } });
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ type: 'selection/update', cell: { row: 7, col: 3 } });
  });

  it('DU-16: アクティブセルが無いときの最初の ↓ / → / Tab / Enter / PageDown は先頭のセルに止まり、Shift+Tab はグリッドの外へ', async () => {
    for (const [key, init] of [
      ['ArrowDown', {}],
      ['ArrowRight', {}],
      ['Tab', {}],
      ['Enter', {}],
      ['PageDown', {}],
      ['ArrowDown', { shiftKey: true }],
    ] as const) {
      const t = setupPage(null);
      await t.press(key, init);
      expect(t.lastActivated()).toEqual({ row: 1, col: 1 });
      expect(t.handleCellDoubleClick).not.toHaveBeenCalled();
    }
    const back = setupPage(null);
    const event = await back.press('Tab', { shiftKey: true });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(back.dispatch).not.toHaveBeenCalled();
    // Ctrl+End は無くても端へ。
    const end = setupPage(null);
    await end.press('End', { ctrlKey: true });
    expect(end.lastActivated()).toEqual({ row: 28, col: 3 });
  });

  // 追加(別視点のレビュー): 範囲の終わりがラベル行のとき(末尾がラベル行の表で全選択した後など)、横に広げてもアクティブセルを
  //   ラベル行に置かない(近いデータ行へ寄せる)。
  it('範囲の終わりがラベル行でも、Shift+← / Shift+Home でアクティブセルはデータ行に置く', async () => {
    const selection = { type: 'cell' as const, range: { start: { row: 1, col: 1 }, end: { row: 29, col: 3 } } };
    const t = setupPage({ row: 1, col: 1 }, { selection });
    await t.press('ArrowLeft', { shiftKey: true });
    expect(t.dispatch.mock.calls.find(([a]) => a.type === 'selection/update')?.[0]).toMatchObject({ cell: { row: 28, col: 2 } });
    expect(t.lastActivated()).toEqual({ row: 28, col: 2 });
    const home = setupPage({ row: 1, col: 1 }, { selection });
    await home.press('Home', { shiftKey: true });
    expect(home.lastActivated()).toEqual({ row: 28, col: 1 });
  });

  // 追加(別視点のレビュー): 行が 0 件なら止まるセルが無いので、Tab はグリッドの外へ出る(止めると出られなかった)。
  it('DU-16: 行が 0 件のときの Tab は既定の動きのまま(グリッドの外へ)', async () => {
    const empty: RowModel<PRow> = {
      getRowCount: () => 0,
      getRow: (i) => pageRows[i] as PRow,
      getSourceIndex: (i) => i,
      getRowKey: (i) => i,
    };
    const t = setupPage(null, { rowModel: empty });
    const event = await t.press('Tab');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(t.dispatch).not.toHaveBeenCalled();
  });
});
