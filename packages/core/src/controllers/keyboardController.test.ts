// 追加(非依存化 ③-7): keyboardController のテストです(React 非依存で update / handleKeyDown を直接呼ぶ)。
//   hooks/useGridKeyboardInteractions.test.ts(特性テスト)と対になり、こちらは update 前の no-op・
//   グループ行の Enter・入力部品配下の無視を固定します。
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createKeyboardController, type KeyboardControllerArgs } from './keyboardController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn, GridGroupRow, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; name: string };
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 100 }];
const rows: Row[] = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];

const makeArgs = (rowModel: RowModel<Row>) => {
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const args: KeyboardControllerArgs<Row> = {
    uiState: { ...createInitialGridUiState(), activeCell: { row: 0, col: 0 } },
    rowModel,
    visibleColumns: columns,
    readOnly: false,
    canEditCell: undefined,
    setEditorInitialValue: vi.fn(),
    dispatch,
    handleCopy: vi.fn(async () => {}),
    handleCellDoubleClick: vi.fn(),
    isWholeGridSelected: false,
    selectEntireGrid: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClearSelection: vi.fn(),
    enableClearOnDelete: true,
    onToggleCheckboxCell: vi.fn(),
    onToggleGroup: vi.fn(),
  };
  return { args, dispatch };
};

const ev = (key: string, target: EventTarget | null = null) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  target,
  preventDefault: vi.fn(),
});

describe('keyboardController', () => {
  it('update 前は何もしない', async () => {
    const c = createKeyboardController<Row>();
    await expect(c.handleKeyDown(ev('ArrowDown'))).resolves.toBeUndefined();
  });

  it('グループ行の Enter は onToggleGroup、入力部品配下のキーは無視', async () => {
    const c = createKeyboardController<Row>();
    const rowModel: RowModel<Row> = {
      getRow: (i) => rows[i],
      getRowCount: () => rows.length,
      getSourceIndex: (i) => i,
      getRowKey: (i) => rows[i]?.id ?? i,
      getGroupRow: (i) =>
        i === 0
          ? ({ groupKey: 'g1', label: 'G', level: 0, leafCount: 1, aggregates: {} } as unknown as GridGroupRow)
          : undefined,
    };
    const t = makeArgs(rowModel);
    c.update(t.args);
    await c.handleKeyDown(ev('Enter'));
    expect(t.args.onToggleGroup).toHaveBeenCalledWith('g1');
    expect(t.args.handleCellDoubleClick).not.toHaveBeenCalled();

    const input = document.createElement('input');
    document.body.appendChild(input);
    await c.handleKeyDown(ev('ArrowDown', input));
    expect(t.dispatch).not.toHaveBeenCalled();
    input.remove();
  });

  it('Tab / Shift+Tab: 列の端では preventDefault せずフォーカスを外へ出す(監査 C-5)', async () => {
    const twoColumns: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 60 },
      { key: 'name', title: '名前', width: 100 },
    ];
    const rowModel: RowModel<Row> = {
      getRow: (i) => rows[i],
      getRowCount: () => rows.length,
      getSourceIndex: (i) => i,
      getRowKey: (i) => rows[i]?.id ?? i,
    };
    const c = createKeyboardController<Row>();
    const t = makeArgs(rowModel);
    const at = (col: number) =>
      c.update({
        ...t.args,
        visibleColumns: twoColumns,
        uiState: { ...t.args.uiState, activeCell: { row: 1, col } },
      });

    // 先頭列で Tab → 右へ移動(既定動作は抑止)
    at(0);
    const tab = ev('Tab');
    await c.handleKeyDown(tab);
    expect(tab.preventDefault).toHaveBeenCalled();
    expect(t.dispatch).toHaveBeenCalled();

    // 最終列で Tab → 何もしない(既定の Tab 移動でグリッド外へ)
    t.dispatch.mockClear();
    at(1);
    const tabAtEnd = ev('Tab');
    await c.handleKeyDown(tabAtEnd);
    expect(tabAtEnd.preventDefault).not.toHaveBeenCalled();
    expect(t.dispatch).not.toHaveBeenCalled();

    // 先頭列で Shift+Tab → 何もしない / 最終列で Shift+Tab → 左へ移動
    at(0);
    const shiftTabAtStart = { ...ev('Tab'), shiftKey: true };
    await c.handleKeyDown(shiftTabAtStart);
    expect(shiftTabAtStart.preventDefault).not.toHaveBeenCalled();
    expect(t.dispatch).not.toHaveBeenCalled();
    at(1);
    const shiftTab = { ...ev('Tab'), shiftKey: true };
    await c.handleKeyDown(shiftTab);
    expect(shiftTab.preventDefault).toHaveBeenCalled();
    expect(t.dispatch).toHaveBeenCalled();
  });

  it('Ctrl/Cmd+F: openFind が渡されたときだけ横取りして開く(F-2)。未指定ならブラウザ標準の検索へ', async () => {
    const rowModel: RowModel<Row> = {
      getRow: (i) => rows[i],
      getRowCount: () => rows.length,
      getSourceIndex: (i) => i,
      getRowKey: (i) => rows[i]?.id ?? i,
    };
    const c = createKeyboardController<Row>();
    const t = makeArgs(rowModel);
    const openFind = vi.fn();
    c.update({ ...t.args, openFind });
    const ctrlF = { ...ev('f'), ctrlKey: true };
    await c.handleKeyDown(ctrlF);
    expect(ctrlF.preventDefault).toHaveBeenCalled();
    expect(openFind).toHaveBeenCalledTimes(1);
    const metaF = { ...ev('F'), metaKey: true };
    await c.handleKeyDown(metaF);
    expect(openFind).toHaveBeenCalledTimes(2);
    // openFind なし(find 無効 / shortcut: false)では preventDefault しない。
    c.update({ ...t.args, openFind: undefined });
    const plain = { ...ev('f'), ctrlKey: true };
    await c.handleKeyDown(plain);
    expect(plain.preventDefault).not.toHaveBeenCalled();
  });
});