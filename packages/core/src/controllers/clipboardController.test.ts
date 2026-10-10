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
});
