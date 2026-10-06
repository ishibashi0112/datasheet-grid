// 追加(非依存化 ③-6): editController のテストです(React 非依存で update / メソッドを直接呼ぶ)。
//   hooks/useGridEditController.test.ts(特性テスト)と対になり、こちらは update 前の no-op と
//   rAF 時点で最新 args を使う clamp を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditController, type EditControllerArgs } from './editController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'qty', title: '数量', width: 80, editor: { type: 'number' } },
];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRow: (i) => rows[i],
  getRowCount: () => rows.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const makeArgs = (rows: Row[], editingCell: { row: number; col: number } | null) => {
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const args: EditControllerArgs<Row> = {
    uiState: { ...createInitialGridUiState(), editingCell },
    rows,
    visibleColumns: columns,
    rowModel: makeRowModel(rows),
    setEditorInitialValue: vi.fn(),
    onRowsChange: vi.fn(),
    dispatch,
    gridRootRef: { current: null },
    editorActionGuardRef: { current: false },
  };
  return { args, dispatch };
};

describe('editController', () => {
  it('update 前はすべて no-op', () => {
    const c = createEditController<Row>();
    expect(c.commitEdit('1')).toEqual({ status: 'noop' });
    expect(() => {
      c.cancelEdit();
      c.activateSingleCell({ row: 0, col: 0 });
      c.startEditWithValue({ row: 0, col: 0 }, 'x');
    }).not.toThrow();
  });

  it('commit 後の移動先は rAF 時点の最新 args(行数)で clamp する', () => {
    const c = createEditController<Row>();
    const rows2 = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }];
    const t = makeArgs(rows2, { row: 1, col: 0 });
    c.update(t.args);
    expect(c.commitEdit('3', 'down')).toEqual({ status: 'committed' });
    expect(t.args.editorActionGuardRef.current).toBe(true);
    // rAF までに行が 1 行に減った(rows 差し替え → update)。
    const rows1 = [{ id: 1, qty: 1 }];
    c.update({ ...t.args, rows: rows1, rowModel: makeRowModel(rows1) });
    for (const cb of rafCallbacks) cb(0);
    const activate = t.dispatch.mock.calls.find(([a]) => a.type === 'cell/activate');
    expect(activate?.[0]).toMatchObject({ cell: { row: 0, col: 0 } });
    expect(t.args.editorActionGuardRef.current).toBe(false);
  });

  it('列 / 行が見つからないときは stopEdit だけ行い noop を返す', () => {
    const c = createEditController<Row>();
    const t = makeArgs([{ id: 1, qty: 1 }], { row: 5, col: 0 });
    c.update(t.args);
    expect(c.commitEdit('1')).toEqual({ status: 'noop' });
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['edit/stop']);
    expect(t.args.onRowsChange).not.toHaveBeenCalled();
  });

  // 追加(audit RD-1): 編集中に rows が差し替わって行順が変わっても、確定は「編集を始めた行」へ書く。
  it('編集中に行順が変わると editingCell を同じ行へ再ターゲットし、確定はその行へ書く(RD-1)', () => {
    const c = createEditController<Row>();
    const rowsA = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }, { id: 3, qty: 3 }];
    const t = makeArgs(rowsA, { row: 1, col: 0 }); // id=2 を編集中
    c.update(t.args);
    // 外部から rows が差し替わり、id=2 が view 2 へ移動(view 1 には id=3 が来る)。
    const rowsB = [{ id: 1, qty: 1 }, { id: 3, qty: 3 }, { id: 2, qty: 2 }];
    c.update({ ...t.args, rows: rowsB, rowModel: makeRowModel(rowsB) });
    const startEdits = t.dispatch.mock.calls.filter(([a]) => a.type === 'edit/start');
    expect(startEdits).toHaveLength(1);
    expect(startEdits[0][0]).toMatchObject({ cell: { row: 2, col: 0 } });
    // reducer が editingCell を更新した体で再度 update(再ターゲット後は dispatch しない)。
    const argsB = { ...t.args, rows: rowsB, rowModel: makeRowModel(rowsB), uiState: { ...t.args.uiState, editingCell: { row: 2, col: 0 } } };
    c.update(argsB);
    expect(t.dispatch.mock.calls.filter(([a]) => a.type === 'edit/start')).toHaveLength(1);
    expect(c.commitEdit('99')).toEqual({ status: 'committed' });
    const written = (argsB.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written.find((r) => r.id === 2)?.qty).toBe(99);
    expect(written.find((r) => r.id === 3)?.qty).toBe(3);
  });

  // 追加(audit RD-3): 編集中の行が消えたら編集を終了する(editingCell が残ってキー操作が全滅しない)。
  it('編集中の行が消えると stopEdit で編集を終了する(RD-3)', () => {
    const c = createEditController<Row>();
    const rowsA = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }, { id: 3, qty: 3 }];
    const t = makeArgs(rowsA, { row: 2, col: 0 }); // id=3 を編集中
    c.update(t.args);
    const rowsB = [{ id: 1, qty: 1 }];
    c.update({ ...t.args, rows: rowsB, rowModel: makeRowModel(rowsB) });
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['edit/stop']);
  });

  it('同じ座標のまま行キーも変わらない通常の再レンダーでは dispatch しない', () => {
    const c = createEditController<Row>();
    const rowsA = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }];
    const t = makeArgs(rowsA, { row: 1, col: 0 });
    c.update(t.args);
    // 値だけ変わった rows(同じ順・同じキー)。
    const rowsB = [{ id: 1, qty: 10 }, { id: 2, qty: 20 }];
    c.update({ ...t.args, rows: rowsB, rowModel: makeRowModel(rowsB) });
    expect(t.dispatch).not.toHaveBeenCalled();
  });

  it('編集を終えて別セルで新しい編集を始めると、新しいセルの同一性を控える', () => {
    const c = createEditController<Row>();
    const rowsA = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }];
    const t = makeArgs(rowsA, { row: 0, col: 0 });
    c.update(t.args);
    c.update({ ...t.args, uiState: { ...t.args.uiState, editingCell: null } });
    c.update({ ...t.args, uiState: { ...t.args.uiState, editingCell: { row: 1, col: 0 } } });
    // id=2 の編集中に id=2 が先頭へ移動 → 再ターゲットは view 0。
    const rowsB = [{ id: 2, qty: 2 }, { id: 1, qty: 1 }];
    c.update({ ...t.args, rows: rowsB, rowModel: makeRowModel(rowsB), uiState: { ...t.args.uiState, editingCell: { row: 1, col: 0 } } });
    const startEdits = t.dispatch.mock.calls.filter(([a]) => a.type === 'edit/start');
    expect(startEdits.at(-1)?.[0]).toMatchObject({ cell: { row: 0, col: 0 } });
  });

  it('確定時に編集不可(readOnly へ切替 / canEditCell=false)なら書き込まず編集を終了する(監査 RD-6)', () => {
    const c = createEditController<Row>();
    const rows = [{ id: 1, qty: 1 }];
    const t = makeArgs(rows, { row: 0, col: 0 });
    c.update(t.args);
    // 編集中に readOnly へ切り替わった
    c.update({ ...t.args, readOnly: true });
    expect(c.commitEdit('9')).toEqual({ status: 'noop' });
    expect(t.args.onRowsChange).not.toHaveBeenCalled();
    expect(t.dispatch.mock.calls.some(([a]) => a.type === 'edit/stop')).toBe(true);
    for (const cb of rafCallbacks.splice(0)) cb(0);
    expect(t.args.editorActionGuardRef.current).toBe(false);

    // canEditCell が false を返すセルも同じ
    const t2 = makeArgs(rows, { row: 0, col: 0 });
    const canEditCell = vi.fn(() => false);
    c.update({ ...t2.args, canEditCell });
    expect(c.commitEdit('9')).toEqual({ status: 'noop' });
    expect(t2.args.onRowsChange).not.toHaveBeenCalled();
    expect(canEditCell).toHaveBeenCalledWith(0, 0, rows[0], columns[0]);

    // 編集可なら従来どおり書き込む
    const t3 = makeArgs(rows, { row: 0, col: 0 });
    c.update({ ...t3.args, readOnly: false, canEditCell: () => true });
    for (const cb of rafCallbacks.splice(0)) cb(0);
    expect(c.commitEdit('9')).toEqual({ status: 'committed' });
    expect(t3.args.onRowsChange).toHaveBeenCalledTimes(1);
  });
});

// 追加(編集確定後のフォーカス奪取): commit / cancel 後の rAF でグリッドへフォーカスを戻すのは、フォーカスが
//   どこにもない(body)かグリッドのルート内のときだけ。グリッド外の要素へ移っていれば(エディタの blur で確定した
//   = クリック先の入力欄)戻さない。
describe('editController: 確定 / 取消後のフォーカス復帰', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mountDom = () => {
    const root = document.createElement('div');
    root.tabIndex = 0;
    const editor = document.createElement('input');
    root.appendChild(editor);
    const card = document.createElement('div');
    card.setAttribute('data-ssg-detail', '');
    const cardInput = document.createElement('input');
    card.appendChild(cardInput);
    root.appendChild(card);
    const outside = document.createElement('input');
    document.body.append(root, outside);
    return { root, editor, cardInput, outside };
  };

  const setup = () => {
    const dom = mountDom();
    const c = createEditController<Row>();
    const t = makeArgs([{ id: 1, qty: 1 }, { id: 2, qty: 2 }], { row: 0, col: 0 });
    c.update({ ...t.args, gridRootRef: { current: dom.root } });
    return { ...dom, c, t };
  };

  const flushRaf = () => {
    for (const cb of rafCallbacks.splice(0)) cb(0);
  };

  it('フォーカスがどこにもない(body)ならグリッドへ戻す(Enter / Tab / Escape でエディタが外れた直後)', () => {
    const { root, c, t } = setup();
    expect(c.commitEdit('3', 'down')).toEqual({ status: 'committed' });
    expect(document.activeElement).toBe(document.body);
    flushRaf();
    expect(document.activeElement).toBe(root);
    expect(t.args.editorActionGuardRef.current).toBe(false);
  });

  it('フォーカスがグリッドのルート内(まだ残っているエディタ)ならグリッドへ戻す', () => {
    const { root, editor, c } = setup();
    editor.focus();
    c.commitEdit('3', 'right');
    flushRaf();
    expect(document.activeElement).toBe(root);
  });

  it('グリッド外の要素へフォーカスが移っていれば戻さない(blur で確定 = クリック先の入力欄から奪わない)', () => {
    const { outside, c, t } = setup();
    outside.focus();
    expect(c.commitEdit('3')).toEqual({ status: 'committed' });
    flushRaf();
    expect(document.activeElement).toBe(outside);
    // 書き込み / アクティブセル / 再入抑止の解除は従来どおり。
    expect(t.args.onRowsChange).toHaveBeenCalledTimes(1);
    expect(t.dispatch.mock.calls.some(([a]) => a.type === 'cell/activate')).toBe(true);
    expect(t.args.editorActionGuardRef.current).toBe(false);
  });

  it('cancelEdit も同じ(グリッド外なら戻さない / body なら戻す)', () => {
    const { root, outside, c, t } = setup();
    outside.focus();
    c.cancelEdit();
    flushRaf();
    expect(document.activeElement).toBe(outside);
    expect(t.args.editorActionGuardRef.current).toBe(false);

    outside.blur();
    c.cancelEdit();
    flushRaf();
    expect(document.activeElement).toBe(root);
  });

  it('確定時に編集不可だった(RD-6 の取消経路)ときも、グリッド外のフォーカスは奪わない', () => {
    const { root, outside, c, t } = setup();
    c.update({ ...t.args, gridRootRef: { current: root }, readOnly: true });
    outside.focus();
    expect(c.commitEdit('3')).toEqual({ status: 'noop' });
    flushRaf();
    expect(document.activeElement).toBe(outside);
  });

  it('展開行カード内のフォーカスは従来どおり奪わない', () => {
    const { cardInput, c } = setup();
    cardInput.focus();
    c.commitEdit('3');
    flushRaf();
    expect(document.activeElement).toBe(cardInput);
  });
});