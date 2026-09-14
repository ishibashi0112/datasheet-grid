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
    uiState: createInitialGridUiState(columns),
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
        ...createInitialGridUiState(columns),
        selection: { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } } },
      },
    });
    c.update(whole.args);
    await c.handleCopy();
    expect(writeText).toHaveBeenLastCalledWith('1\ta\n2\tb');

    const partial = makeArgs({
      uiState: {
        ...createInitialGridUiState(columns),
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
      uiState: { ...createInitialGridUiState(columns), activeCell: { row: 0, col: 1 } },
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
});