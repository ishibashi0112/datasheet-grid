// 追加(非依存化 ③-8): clipboardController のテストです(React 非依存で直接呼ぶ)。
//   hook 側の特性テスト(コピーの isRowExportable / ペースト)と対になり、こちらは
//   computeIsWholeGridSelected / update 前の no-op / 構造的イベント型でのコピー・ペーストを固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeIsWholeGridSelected,
  createClipboardController,
  type ClipboardControllerArgs,
} from './clipboardController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; name: string };
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 120 },
];
const rows: Row[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
];
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const makeArgs = (overrides: Partial<ClipboardControllerArgs<Row>> = {}) => {
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const args: ClipboardControllerArgs<Row> = {
    rows,
    rowModel,
    visibleColumns: columns,
    uiState: createInitialGridUiState(),
    readOnly: false,
    canEditCell: undefined,
    onRowsChange: vi.fn(),
    dispatch,
    ...overrides,
  };
  return { args, dispatch };
};

describe('computeIsWholeGridSelected', () => {
  it('セル範囲が 0..last × 0..last のときだけ true(逆向きの範囲も可)', () => {
    expect(
      computeIsWholeGridSelected(
        { type: 'cell', range: { start: { row: 1, col: 1 }, end: { row: 0, col: 0 } } },
        2,
        2,
      ),
    ).toBe(true);
    expect(
      computeIsWholeGridSelected(
        { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } } },
        2,
        2,
      ),
    ).toBe(false);
    expect(computeIsWholeGridSelected({ type: 'row', startRow: 0, endRow: 1 }, 2, 2)).toBe(false);
    expect(computeIsWholeGridSelected(null, 2, 2)).toBe(false);
    expect(
      computeIsWholeGridSelected(
        { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } } },
        0,
        2,
      ),
    ).toBe(false);
  });
});

describe('clipboardController', () => {
  it('update 前は copy / paste とも no-op', async () => {
    const c = createClipboardController<Row>();
    await c.handleCopy();
    expect(writeText).not.toHaveBeenCalled();
    const preventDefault = vi.fn();
    c.handlePaste({ clipboardData: { getData: () => 'x' }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('全選択のコピーは全行の TSV、部分選択は範囲の TSV', async () => {
    const c = createClipboardController<Row>();
    const whole = makeArgs({
      uiState: {
        ...createInitialGridUiState(),
        selection: { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } } },
      },
    });
    c.update(whole.args);
    await c.handleCopy();
    expect(writeText).toHaveBeenLastCalledWith('1\ta\n2\tb');

    const partial = makeArgs({
      uiState: {
        ...createInitialGridUiState(),
        selection: { type: 'cell', range: { start: { row: 1, col: 1 }, end: { row: 1, col: 1 } } },
      },
    });
    c.update(partial.args);
    await c.handleCopy();
    expect(writeText).toHaveBeenLastCalledWith('b');
  });

  // 追加(1.0.2 / レビュー QA-10): 全体の選択のコピーも、最後の行がすべて空なら末尾に改行を足す(RV-C1 と同じ)。
  it('全選択のコピーで最後の行が空なら末尾に改行を足す(1 列の表で最後の空の行が貼り付けで消えない)', async () => {
    type One = { name: string };
    const oneRows: One[] = [{ name: 'x' }, { name: '' }];
    const c = createClipboardController<One>();
    c.update({
      rows: oneRows,
      rowModel: {
        getRowCount: () => oneRows.length,
        getRow: (i) => oneRows[i],
        getSourceIndex: (i) => i,
        getRowKey: (i) => i,
      },
      visibleColumns: [{ key: 'name', title: 'Name', width: 120 }],
      uiState: {
        ...createInitialGridUiState(),
        selection: { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } } },
      },
      readOnly: false,
      canEditCell: undefined,
      onRowsChange: vi.fn(),
      dispatch: vi.fn(),
    });
    await c.handleCopy();
    expect(writeText).toHaveBeenLastCalledWith('x\n\n');
  });

  it('構造的イベント型でペーストでき、clipboardData が null なら何もしない', () => {
    const c = createClipboardController<Row>();
    const t = makeArgs({
      uiState: { ...createInitialGridUiState(), activeCell: { row: 0, col: 1 } },
    });
    c.update(t.args);
    const preventDefault = vi.fn();
    c.handlePaste({ clipboardData: { getData: () => 'Z' }, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(t.args.onRowsChange).toHaveBeenCalledTimes(1);
    expect((t.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0][0]).toMatchObject({ id: 1, name: 'Z' });

    const nullEvent = { clipboardData: null, preventDefault: vi.fn() };
    c.handlePaste(nullEvent);
    expect(nullEvent.preventDefault).not.toHaveBeenCalled();
  });

  // 追加(audit L-01): 列あふれ貼り付けの onColumnsChange は consumer の columns(論理順・非表示列込み)
  //   + overflow 列。視覚順の可視列 + 合成列を返して非表示列を消したり合成列を混入させない。
  it('列あふれ貼り付けは consumer の columns に overflow 列を足して onColumnsChange する(L-01)', () => {
    const c = createClipboardController<Row>();
    const consumerColumns: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'hidden', title: 'H', width: 80, visible: false },
      { key: 'name', title: 'Name', width: 120, pinned: 'left' },
    ];
    // 視覚順(左固定 → 中央)+ 先頭の合成列(行ドラッグハンドル相当)。
    const ordered: GridColumn<Row>[] = [
      { key: '__ssg_row_drag_handle__', title: '', width: 28, pinned: 'left' },
      consumerColumns[2],
      consumerColumns[0],
    ];
    const onColumnsChange = vi.fn();
    const t = makeArgs({
      columns: consumerColumns,
      visibleColumns: ordered,
      uiState: { ...createInitialGridUiState(), activeCell: { row: 0, col: 2 } },
      createOverflowColumn: (index) => ({ key: `extra${index}`, title: `追加 ${index}`, width: 100 }),
      onColumnsChange,
    });
    c.update(t.args);
    c.handlePaste({ clipboardData: { getData: () => 'x\ty' }, preventDefault: vi.fn() });
    expect(onColumnsChange).toHaveBeenCalledTimes(1);
    const next = onColumnsChange.mock.calls[0][0] as GridColumn<Row>[];
    expect(next.map((col) => col.key)).toEqual(['id', 'hidden', 'name', 'extra3']);
    // 書き込み自体は視覚順で行われる(id 列 → overflow 列)。
    const written = (t.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written[0]).toMatchObject({ id: 'x', extra3: 'y' });
  });

  // 追加(audit L-05): ソート中(view ≠ source)に view 末尾を超えて貼り付けても行が捨てられない。
  it('ソート中に view 末尾を超える貼り付けは createRow で行を追記する(L-05)', () => {
    const c = createClipboardController<Row>();
    const sortedRows: Row[] = [
      { id: 1, name: 'r0' },
      { id: 2, name: 'r1' },
      { id: 3, name: 'r2' },
    ];
    const order = [2, 1, 0]; // 降順: view 0 = source 2
    const sortedModel: RowModel<Row> = {
      getRowCount: () => order.length,
      getRow: (i) => sortedRows[order[i]],
      getSourceIndex: (i) => order[i],
      getRowKey: (i) => sortedRows[order[i]]?.id ?? i,
    };
    let nextId = 100;
    const t = makeArgs({
      rows: sortedRows,
      rowModel: sortedModel,
      uiState: { ...createInitialGridUiState(), activeCell: { row: 2, col: 1 } },
      createRow: () => ({ id: nextId++, name: '' }),
    });
    c.update(t.args);
    c.handlePaste({ clipboardData: { getData: () => 'p1\np2\np3' }, preventDefault: vi.fn() });
    const written = (t.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written.map((r) => r.name)).toEqual(['p1', 'r1', 'r2', 'p2', 'p3']);
  });

  // 追加(audit C-12): 先頭行が他の行より短い TSV でも、選択範囲は実際に貼り付けた範囲(最も長い行の幅)になる。
  it('先頭行が短い TSV の貼り付け後の選択範囲は最も長い行の幅になる(C-12)', () => {
    const c = createClipboardController<Row>();
    const t = makeArgs({
      uiState: { ...createInitialGridUiState(), activeCell: { row: 0, col: 0 } },
    });
    c.update(t.args);
    c.handlePaste({ clipboardData: { getData: () => 'a\nb\tc' }, preventDefault: vi.fn() });
    const written = (t.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written[1]).toMatchObject({ id: 'b', name: 'c' });
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'selection/update', cell: { row: 1, col: 1 } });
  });

  // 追加(1.0.2 / 2026-11-09 実アプリの総点検 C-02): 行 / 列を足せないときに表の外へはみ出す貼り付けは、選択範囲を書いた範囲まで。
  it('行 / 列を足せないとき、貼り付け後の選択範囲は表の中まで(C-02)', () => {
    const c = createClipboardController<Row>();
    const t = makeArgs({
      uiState: { ...createInitialGridUiState(), activeCell: { row: 1, col: 1 } },
    });
    c.update(t.args);
    c.handlePaste({ clipboardData: { getData: () => 'x\ty\tz\np\tq\tr' }, preventDefault: vi.fn() });
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'selection/update', cell: { row: 1, col: 1 } });

    // createRow があれば足した行まで選ぶ(従来どおり)。
    const withCreate = makeArgs({
      uiState: { ...createInitialGridUiState(), activeCell: { row: 1, col: 1 } },
      createRow: () => ({ id: 9, name: '' }),
    });
    c.update(withCreate.args);
    c.handlePaste({ clipboardData: { getData: () => 'x\ny\nz' }, preventDefault: vi.fn() });
    expect(withCreate.dispatch).toHaveBeenCalledWith({ type: 'selection/update', cell: { row: 3, col: 1 } });
  });

  // 追加(audit RD-2): 編集中 / 入力要素が発火元の paste はグリッドが横取りしない。
  it('セル編集中の paste は無視する(エディタ input のネイティブ貼り付けに委ねる)', () => {
    const c = createClipboardController<Row>();
    const t = makeArgs({
      uiState: {
        ...createInitialGridUiState(),
        activeCell: { row: 0, col: 1 },
        editingCell: { row: 0, col: 1 },
      },
    });
    c.update(t.args);
    const preventDefault = vi.fn();
    c.handlePaste({ clipboardData: { getData: () => 'Z' }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(t.args.onRowsChange).not.toHaveBeenCalled();
  });

  it('input / textarea / contenteditable から発火した paste は無視する', () => {
    const c = createClipboardController<Row>();
    const t = makeArgs({
      uiState: { ...createInitialGridUiState(), activeCell: { row: 0, col: 1 } },
    });
    c.update(t.args);
    for (const el of [
      document.createElement('input'),
      document.createElement('textarea'),
      (() => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', '');
        return div;
      })(),
    ]) {
      document.body.appendChild(el);
      const preventDefault = vi.fn();
      c.handlePaste({ clipboardData: { getData: () => 'Z' }, preventDefault, target: el });
      expect(preventDefault).not.toHaveBeenCalled();
      el.remove();
    }
    expect(t.args.onRowsChange).not.toHaveBeenCalled();
    // 通常のセル(div)が発火元なら従来どおり貼り付ける。
    const cell = document.createElement('div');
    const preventDefault = vi.fn();
    c.handlePaste({ clipboardData: { getData: () => 'Z' }, preventDefault, target: cell });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(t.args.onRowsChange).toHaveBeenCalledTimes(1);
  });

  // 追加(motion-4 / M-3): コピー成功でコピー元の選択を onCopied へ通知する(動く点線の描画元)。
  it('コピーが成功したとき onCopied にコピー元の選択を渡し、選択なし(no-op)では呼ばない', async () => {
    const onCopied = vi.fn();
    const selection = { type: 'cell' as const, range: { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } } };
    const { args } = makeArgs({ uiState: { ...createInitialGridUiState(), selection }, onCopied });
    const c = createClipboardController<Row>();
    c.update(args);
    await c.handleCopy();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onCopied).toHaveBeenCalledWith(selection);
    // 選択なし: 何も書かず通知もしない。
    const none = makeArgs({ onCopied });
    const c2 = createClipboardController<Row>();
    c2.update(none.args);
    onCopied.mockClear();
    writeText.mockClear();
    await c2.handleCopy();
    expect(writeText).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
  });

  // 追加(1.0.1 / 実アプリの総点検 AP-02): 範囲を選んで貼り付けると、範囲の左上から貼る(Shift+矢印で広げると
  //   アクティブセルは範囲の端にあり、そこから貼っていた)。
  it('範囲の選択への貼り付けは範囲の左上から(アクティブセルが範囲の端でも)(AP-02)', () => {
    const c = createClipboardController<Row>();
    const t = makeArgs({
      uiState: {
        ...createInitialGridUiState(),
        activeCell: { row: 1, col: 1 },
        selection: { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } } },
      },
    });
    c.update(t.args);
    c.handlePaste({ clipboardData: { getData: () => 'x\ty\nz\tw' }, preventDefault: vi.fn() });
    const written = (t.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written).toEqual([
      { id: 'x', name: 'y' },
      { id: 'z', name: 'w' },
    ]);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'cell/activate', cell: { row: 0, col: 0 } });
  });

  it('列の選択への貼り付けは列の先頭の行から、範囲の外のアクティブセルはそのまま(AP-02)', () => {
    const c = createClipboardController<Row>();
    const col = makeArgs({
      uiState: {
        ...createInitialGridUiState(),
        activeCell: { row: 1, col: 1 },
        selection: { type: 'col', startCol: 1, endCol: 1 },
      },
    });
    c.update(col.args);
    c.handlePaste({ clipboardData: { getData: () => 'p\nq' }, preventDefault: vi.fn() });
    const written = (col.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written.map((r) => r.name)).toEqual(['p', 'q']);

    // 選択の外にアクティブセルがあるとき(選択だけ別の場所に残っている)はアクティブセルから。
    const outside = makeArgs({
      uiState: {
        ...createInitialGridUiState(),
        activeCell: { row: 1, col: 0 },
        selection: { type: 'cell', range: { start: { row: 0, col: 1 }, end: { row: 0, col: 1 } } },
      },
    });
    c.update(outside.args);
    c.handlePaste({ clipboardData: { getData: () => 'k' }, preventDefault: vi.fn() });
    const written2 = (outside.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written2[1]).toEqual({ id: 'k', name: 'b' });
  });

  // 追加(1.0.1 / AP-04): 行グルーピング中の貼り付けはグループ行を読み飛ばす(ラベル行と同じ)。値が捨てられていた。
  it('グループ行をまたぐ貼り付けはグループ行を読み飛ばし、列の選択は先頭のデータ行から(AP-04)', () => {
    const c = createClipboardController<Row>();
    const leafRows: Row[] = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ];
    // view: 0 = グループ行 / 1 = a / 2 = グループ行 / 3 = b / 4 = c
    const viewToSource: (number | undefined)[] = [undefined, 0, undefined, 1, 2];
    const groupModel: RowModel<Row> = {
      getRowCount: () => viewToSource.length,
      // グループ行では getRow / getSourceIndex が実行時 undefined(本物の rowModel と同じ)。
      getRow: (i) => {
        const source = viewToSource[i];
        return (source === undefined ? undefined : leafRows[source]) as Row;
      },
      getSourceIndex: (i) => viewToSource[i] as number,
      getRowKey: (i) => i,
      getGroupRow: (i) =>
        viewToSource[i] === undefined
          ? {
              kind: 'group',
              groupKey: `g${i}`,
              columnKey: 'name',
              value: i,
              label: String(i),
              level: 0,
              leafCount: 1,
              aggregates: {},
            }
          : undefined,
    };
    const cell = makeArgs({
      rows: leafRows,
      rowModel: groupModel,
      uiState: { ...createInitialGridUiState(), activeCell: { row: 1, col: 1 } },
    });
    c.update(cell.args);
    c.handlePaste({ clipboardData: { getData: () => 'x\ny\nz' }, preventDefault: vi.fn() });
    const written = (cell.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written.map((r) => r.name)).toEqual(['x', 'y', 'z']);
    expect(cell.dispatch).toHaveBeenCalledWith({ type: 'selection/update', cell: { row: 4, col: 1 } });

    const col = makeArgs({
      rows: leafRows,
      rowModel: groupModel,
      uiState: {
        ...createInitialGridUiState(),
        activeCell: { row: 3, col: 1 },
        selection: { type: 'col', startCol: 1, endCol: 1 },
      },
    });
    c.update(col.args);
    c.handlePaste({ clipboardData: { getData: () => 'p\nq' }, preventDefault: vi.fn() });
    const written2 = (col.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written2.map((r) => r.name)).toEqual(['p', 'q', 'c']);

    // 変更(1.0.1 のレビュー RA-2): 範囲の左上がグループ行(全選択など)でも、先頭のデータ行から貼る。
    const all = makeArgs({
      rows: leafRows,
      rowModel: groupModel,
      uiState: {
        ...createInitialGridUiState(),
        activeCell: { row: 4, col: 1 },
        selection: { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 4, col: 1 } } },
      },
    });
    c.update(all.args);
    c.handlePaste({ clipboardData: { getData: () => 'r\ts' }, preventDefault: vi.fn() });
    const written3 = (all.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
    expect(written3[0]).toEqual({ id: 'r', name: 's' });
    expect(all.dispatch).toHaveBeenCalledWith({ type: 'cell/activate', cell: { row: 1, col: 0 } });
  });

  // 追加(1.0.1 のレビュー RA-2): 全選択 / 行の選択の左上が合成列(行ドラッグの掴み手)のときは、合成列でない最初の列を
  //   起点にする(貼った後のアクティブセルが掴み手の列に乗っていた)。
  it('起点の列は合成列を飛ばす(RA-2)', () => {
    const c = createClipboardController<Row>();
    const withHandle: GridColumn<Row>[] = [{ key: '__ssg_row_drag_handle__', title: '', width: 24 }, ...columns];
    for (const selection of [
      { type: 'cell' as const, range: { start: { row: 0, col: 0 }, end: { row: 1, col: 2 } } },
      { type: 'row' as const, startRow: 0, endRow: 1 },
    ]) {
      const t = makeArgs({
        visibleColumns: withHandle,
        uiState: { ...createInitialGridUiState(), activeCell: { row: 1, col: 2 }, selection },
      });
      c.update(t.args);
      c.handlePaste({ clipboardData: { getData: () => 'x\ty' }, preventDefault: vi.fn() });
      const written = (t.args.onRowsChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Row[];
      expect(written[0]).toEqual({ id: 'x', name: 'y' });
      expect(t.dispatch).toHaveBeenCalledWith({ type: 'cell/activate', cell: { row: 0, col: 1 } });
    }
  });
});
