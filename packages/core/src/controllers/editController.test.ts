// 追加(非依存化 ③-6): editController のテストです(React 非依存で update / メソッドを直接呼ぶ)。
//   hooks/useGridEditController.test.ts(特性テスト)と対になり、こちらは update 前の no-op と
//   rAF 時点で最新 args を使う clamp を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditController, type EditControllerArgs } from './editController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '../logic/rowReorder';

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

  // 追加(1.0.2 / 2026-11-09 実アプリの総点検 F-04): 先頭のデータ列の Shift+Tab(左への確定)で行ドラッグのハンドル列に止まらない。
  it('左への確定は操作用の合成列へ入らない(F-04)', () => {
    const c = createEditController<Row>();
    const rows1 = [{ id: 1, qty: 1 }];
    const withHandle: GridColumn<Row>[] = [{ key: ROW_DRAG_HANDLE_COLUMN_KEY, title: '', width: 28 }, ...columns];
    const t = makeArgs(rows1, { row: 0, col: 1 });
    c.update({ ...t.args, visibleColumns: withHandle });
    expect(c.commitEdit('3', 'left')).toEqual({ status: 'committed' });
    for (const cb of rafCallbacks) cb(0);
    const activate = t.dispatch.mock.calls.find(([a]) => a.type === 'cell/activate');
    expect(activate?.[0]).toMatchObject({ cell: { row: 0, col: 1 } });
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
    const startEdits = t.dispatch.mock.calls.filter(([a]) => a.type === 'edit/retarget');
    expect(startEdits).toHaveLength(1);
    expect(startEdits[0][0]).toMatchObject({ cell: { row: 2, col: 0 } });
    // reducer が editingCell を更新した体で再度 update(再ターゲット後は dispatch しない)。
    const argsB = { ...t.args, rows: rowsB, rowModel: makeRowModel(rowsB), uiState: { ...t.args.uiState, editingCell: { row: 2, col: 0 } } };
    c.update(argsB);
    expect(t.dispatch.mock.calls.filter(([a]) => a.type === 'edit/retarget')).toHaveLength(1);
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
    const startEdits = t.dispatch.mock.calls.filter(([a]) => a.type === 'edit/retarget');
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
    // 変更(audit RD-4): 第 5 引数に元 rows の index と rowKey が入る。
    expect(canEditCell).toHaveBeenCalledWith(0, 0, rows[0], columns[0], { sourceRowIndex: 0, rowKey: 1 });

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

// 追加(確定後のアクティブセル上書き): 方向なしの確定(blur など)の後処理は、rAF までにアクティブセル / 選択が
//   変わっていれば(グリッド内の別のセルや行・列ヘッダーを押して blur 確定した)編集していたセルへ戻さない。
//   何も変わっていなければ / 方向付きの確定なら従来どおり。
describe('editController: 確定後のアクティブセル', () => {
  const editing = { row: 0, col: 0 };
  const rows3 = [{ id: 1, qty: 1 }, { id: 2, qty: 2 }, { id: 3, qty: 3 }];

  // 編集中(edit/start 後 = activeCell は編集セル、selection は単一セル)の args。
  const setup = () => {
    const c = createEditController<Row>();
    const t = makeArgs(rows3, editing);
    const uiState = {
      ...t.args.uiState,
      activeCell: editing,
      selection: { type: 'cell' as const, range: { start: editing, end: editing } },
    };
    const args = { ...t.args, uiState };
    c.update(args);
    return { c, t, args };
  };

  // reducer が edit/stop を反映した後の state(activeCell / selection の参照は保たれる)。
  const afterStop = (args: EditControllerArgs<Row>) => ({
    ...args,
    uiState: { ...args.uiState, editingCell: null },
  });

  const flushRaf = () => {
    for (const cb of rafCallbacks.splice(0)) cb(0);
  };

  const activations = (t: ReturnType<typeof makeArgs>) =>
    t.dispatch.mock.calls.filter(([a]) => a.type === 'cell/activate').map(([a]) => a);

  // 追加(1.2.0 の確かめ直し K): activeCellFollows: 'row' では、確定の後の移動の先を確定した時点の並びの行キーで覚え、
  //   並びが変わった後もその行へ動かす(Enter = 前の並びで下にあった行、Tab = 編集した行)。
  it("'row'(followsRow)では、確定で並びが変わっても移動の先を確定した時点の行で決める", () => {
    for (const [direction, expectedRow] of [
      ['down', 0],
      ['right', 2],
    ] as const) {
      const c = createEditController<Row>();
      const t = makeArgs(rows3, editing);
      const uiState = {
        ...t.args.uiState,
        activeCell: editing,
        selection: { type: 'cell' as const, range: { start: editing, end: editing } },
      };
      const args = { ...t.args, uiState, followsRow: true };
      c.update(args);
      c.commitEdit('0', direction);
      // 確定で id=1 が一番下へ動いた並び(id=2, id=3, id=1)。
      const reordered = [{ id: 2, qty: 2 }, { id: 3, qty: 3 }, { id: 1, qty: 0 }];
      c.update({ ...afterStop(args), rows: reordered, rowModel: makeRowModel(reordered) });
      flushRaf();
      // down: 前の並びで下にあった id=2(今は 0 行目)。right: 編集した id=1(今は 2 行目。列は 1 つの表なので 0 に収まる)。
      expect(activations(t).at(-1)).toEqual({ type: 'cell/activate', cell: { row: expectedRow, col: 0 } });
    }
  });

  it('方向なしの確定で何も変わっていなければ、従来どおり編集していたセルを単一選択にする', () => {
    const { c, t, args } = setup();
    expect(c.commitEdit('9')).toEqual({ status: 'committed' });
    c.update(afterStop(args));
    flushRaf();
    expect(activations(t)).toEqual([{ type: 'cell/activate', cell: editing }]);
    expect(t.args.editorActionGuardRef.current).toBe(false);
  });

  it('方向なしの確定の後、rAF までに別のセルがアクティブになっていれば編集していたセルへ戻さない', () => {
    const { c, t, args } = setup();
    c.commitEdit('9'); // 別のセルの pointerdown → ルートへ focus → エディタの blur で確定
    const clicked = { row: 2, col: 0 };
    const stopped = afterStop(args);
    c.update({
      ...stopped,
      uiState: {
        ...stopped.uiState,
        activeCell: clicked,
        selection: { type: 'cell', range: { start: clicked, end: clicked } },
      },
    });
    flushRaf();
    expect(activations(t)).toEqual([]);
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['edit/stop']);
    expect(t.args.editorActionGuardRef.current).toBe(false);
  });

  it('選択だけが変わった(行ヘッダー / 命令的 API 等)ときも戻さない', () => {
    const { c, t, args } = setup();
    c.commitEdit('9');
    const stopped = afterStop(args);
    c.update({
      ...stopped,
      uiState: { ...stopped.uiState, selection: { type: 'row', startRow: 1, endRow: 1 } },
    });
    flushRaf();
    expect(activations(t)).toEqual([]);
  });

  it('方向付きの確定(Enter / Tab)は、アクティブセルが変わっていても従来どおり移動する', () => {
    const { c, t, args } = setup();
    c.commitEdit('9', 'down');
    const stopped = afterStop(args);
    c.update({ ...stopped, uiState: { ...stopped.uiState, activeCell: { row: 2, col: 0 } } });
    flushRaf();
    expect(activations(t)).toEqual([{ type: 'cell/activate', cell: { row: 1, col: 0 } }]);
  });
});
// 追加(1.4.1 / 2026-11-09 実アプリの総点検 AP-11): グリッドの中を押したとき、開いたままの custom エディタの編集をグリッドが終え、
//   その後に届いた ctx.commit(onBlur でサーバーの検査を待ってから確定する作り)は編集していたセルへ書く。
describe('editController: 開いたままの custom エディタ(AP-11)', () => {
  type NoteRow = { id: number; note: string; qty: number };
  const customColumns: GridColumn<NoteRow>[] = [
    { key: 'note', title: 'メモ', width: 120, editor: { type: 'custom', render: () => null } },
    { key: 'qty', title: '数量', width: 80, editor: { type: 'number' } },
  ];
  const makeNoteRowModel = (rows: NoteRow[]): RowModel<NoteRow> => ({
    getRow: (i) => rows[i],
    getRowCount: () => rows.length,
    getSourceIndex: (i) => i,
    getRowKey: (i) => rows[i]?.id ?? i,
  });
  const baseRows: NoteRow[] = [
    { id: 1, note: 'a', qty: 1 },
    { id: 2, note: 'b', qty: 2 },
    { id: 3, note: 'c', qty: 3 },
  ];
  const setup = (editingCell: { row: number; col: number }, rows: NoteRow[] = baseRows) => {
    const dispatch = vi.fn<(a: GridUiAction) => void>();
    const onRowsChange = vi.fn<(next: NoteRow[]) => void>();
    const uiState = { ...createInitialGridUiState(), editingCell, activeCell: editingCell };
    const args: EditControllerArgs<NoteRow> = {
      uiState,
      rows,
      visibleColumns: customColumns,
      rowModel: makeNoteRowModel(rows),
      setEditorInitialValue: vi.fn(),
      onRowsChange,
      dispatch,
      gridRootRef: { current: null },
      editorActionGuardRef: { current: false },
      getUiState: () => uiState,
      rowKeyGetter: (row) => row.id,
    };
    const c = createEditController<NoteRow>();
    c.update(args);
    const received: Array<(value: unknown) => unknown> = [];
    const unregister = c.registerLateCommitReceiver((commit) => {
      received.push(commit);
    });
    return { c, args, dispatch, onRowsChange, received, unregister };
  };

  it('custom エディタが開いたままなら編集を終え、遅れて届いた確定を編集していたセルへ書く(1 回だけ)', () => {
    const t = setup({ row: 1, col: 0 });
    t.c.endEditLeftOpen();
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['edit/stop']);
    expect(t.received).toHaveLength(1);
    // 押した後にアクティブセルが動き、編集が終わった状態を描いた後で、onBlur の検査を待った確定が届く。
    t.c.update({ ...t.args, uiState: { ...t.args.uiState, editingCell: null, activeCell: { row: 2, col: 1 } } });
    expect(t.received[0]!('late')).toEqual({ status: 'committed' });
    expect(t.onRowsChange.mock.calls[0]![0].map((row) => row.note)).toEqual(['a', 'late', 'c']);
    // 2 回目は書かない。アクティブセルは動かさない(後処理は移動しない)。
    expect(t.received[0]!('again')).toEqual({ status: 'noop' });
    expect(t.onRowsChange).toHaveBeenCalledTimes(1);
    expect(t.dispatch.mock.calls.filter(([a]) => a.type === 'cell/activate')).toEqual([]);
  });

  it('終えた後に並びが変わっても、行のキーで編集していた行へ書く', () => {
    const t = setup({ row: 1, col: 0 });
    t.c.endEditLeftOpen();
    const reordered = [baseRows[2]!, baseRows[0]!, baseRows[1]!];
    t.c.update({
      ...t.args,
      rows: reordered,
      rowModel: makeNoteRowModel(reordered),
      uiState: { ...t.args.uiState, editingCell: null },
    });
    expect(t.received[0]!('late')).toEqual({ status: 'committed' });
    const written = t.onRowsChange.mock.calls[0]![0];
    expect(written.find((row) => row.id === 2)?.note).toBe('late');
    expect(written.find((row) => row.id === 1)?.note).toBe('a');
  });

  it('終えた後に行が消えていれば書かない / 編集できなくなっていれば書かない', () => {
    const gone = setup({ row: 1, col: 0 });
    gone.c.endEditLeftOpen();
    const rest = [baseRows[0]!];
    gone.c.update({ ...gone.args, rows: rest, rowModel: makeNoteRowModel(rest), uiState: { ...gone.args.uiState, editingCell: null } });
    expect(gone.received[0]!('late')).toEqual({ status: 'noop' });
    expect(gone.onRowsChange).not.toHaveBeenCalled();

    const locked = setup({ row: 1, col: 0 });
    locked.c.endEditLeftOpen();
    locked.c.update({ ...locked.args, readOnly: true, uiState: { ...locked.args.uiState, editingCell: null } });
    expect(locked.received[0]!('late')).toEqual({ status: 'noop' });
    expect(locked.onRowsChange).not.toHaveBeenCalled();
  });

  it('検査で reject する値は書かず、rejected を返す', () => {
    const rejecting: GridColumn<NoteRow>[] = [
      { ...customColumns[0]!, validate: ({ value }) => (value === 'ng' ? 'だめです' : true), validationMode: 'reject' },
      customColumns[1]!,
    ];
    const t = setup({ row: 0, col: 0 });
    t.c.update({ ...t.args, visibleColumns: rejecting });
    t.c.endEditLeftOpen();
    expect(t.received[0]!('ng')).toEqual({ status: 'rejected', message: 'だめです' });
    expect(t.onRowsChange).not.toHaveBeenCalled();
  });

  it('組み込みのエディタ(blur で自分で確定する)・確定の直後(再入抑止中)・編集していないときは何もしない', () => {
    const builtIn = setup({ row: 0, col: 1 });
    builtIn.c.endEditLeftOpen();
    expect(builtIn.dispatch).not.toHaveBeenCalled();
    expect(builtIn.received).toEqual([]);

    // onBlur で同期に ctx.commit した(押したことによる blur)後は、もう終わっている。
    const committed = setup({ row: 0, col: 0 });
    expect(committed.c.commitEdit('x')).toEqual({ status: 'committed' });
    committed.c.endEditLeftOpen();
    expect(committed.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['edit/stop']);
    expect(committed.received).toEqual([]);

    const idle = setup({ row: 0, col: 0 });
    idle.c.update({ ...idle.args, uiState: { ...idle.args.uiState, editingCell: null }, getUiState: undefined });
    idle.c.endEditLeftOpen();
    expect(idle.dispatch).not.toHaveBeenCalled();
  });

  it('受け取り口を外した後・次のセッションの箱が先に登録した後', () => {
    const t = setup({ row: 0, col: 0 });
    // 次のセッションの箱が先に登録してから、前の箱が外す(前の箱の外しは今の登録を消さない)。
    const next: unknown[] = [];
    t.c.registerLateCommitReceiver((commit) => next.push(commit));
    t.unregister();
    t.c.endEditLeftOpen();
    expect(next).toHaveLength(1);
    expect(t.received).toEqual([]);
  });

  it('serverSide では今の表の位置へ書き戻す(表に無ければ書かない)', () => {
    const t = setup({ row: 2, col: 0 });
    const applyServerSideCellEdits = vi.fn(() => 1);
    t.c.update({ ...t.args, onRowsChange: undefined, applyServerSideCellEdits });
    t.c.endEditLeftOpen();
    expect(t.received[0]!('late')).toEqual({ status: 'committed' });
    expect(applyServerSideCellEdits).toHaveBeenCalledWith([{ viewIndex: 2, column: customColumns[0], value: 'late' }]);
  });
});