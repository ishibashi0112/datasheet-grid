// 追加(proposals ⑪)の回帰テスト: コピー(Ctrl/⌘+C 相当の handleCopy)での isRowExportable
//   適用です。4 経路(全選択 = serializeWholeGridToTsv / セル範囲・行選択・列選択 =
//   serializeSelectionToTsv)すべてで false 行が TSV から行ごと落ちること、ctx
//   (viewRowIndex / rowKey)の値、isWholeGridSelected 判定へ影響しないことを
//   renderHook 直叩きで検証します(navigator.clipboard.writeText は stub)。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useGridClipboardController } from './useGridClipboardController';
import { createInitialGridUiState } from '@ishibashi0112/spreadsheet-grid-core/model/gridReducer';
import type {
  GridColumn,
  GridSelection,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes';

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 120 },
];

const rows: Row[] = [
  { id: 10, name: 'alpha' },
  { id: 20, name: 'placeholder' },
  { id: 30, name: 'gamma' },
];

const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (viewIndex) => rows[viewIndex],
  getSourceIndex: (viewIndex) => viewIndex,
  getRowKey: (viewIndex) => rows[viewIndex].id,
};

// name='placeholder' の行(viewIndex 1 / rowKey 20)を出力対象外にします。
const excludePlaceholder: SpreadsheetGridProps<Row>['isRowExportable'] = (
  row,
) => row.name !== 'placeholder';

// 全セル範囲の cell 選択(= isWholeGridSelected true になる形)です。
const wholeGridSelection: GridSelection = {
  type: 'cell',
  range: { start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
};

let writeTextSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeTextSpy = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextSpy },
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
});

// 指定 selection でコントローラを立てて handleCopy し、書き込まれた TSV を返します。
const copyWith = async (
  selection: GridSelection,
  isRowExportable?: SpreadsheetGridProps<Row>['isRowExportable'],
): Promise<string> => {
  const uiState: GridUiState = {
    ...createInitialGridUiState(columns),
    selection,
  };
  const { result } = renderHook(() =>
    useGridClipboardController<Row>({
      rows,
      rowModel,
      visibleColumns: columns,
      uiState,
      readOnly: false,
      canEditCell: undefined,
      dispatch: () => {},
      isRowExportable,
    }),
  );
  writeTextSpy.mockClear();
  await act(async () => {
    await result.current.handleCopy();
  });
  expect(writeTextSpy).toHaveBeenCalledTimes(1);
  return writeTextSpy.mock.calls[0][0] as string;
};

describe('コピーの isRowExportable(proposals ⑪)', () => {
  it('全選択(専用経路)で false 行が落ちる。未指定時は従来どおり全行', async () => {
    expect(await copyWith(wholeGridSelection)).toBe(
      '10\talpha\n20\tplaceholder\n30\tgamma',
    );
    expect(await copyWith(wholeGridSelection, excludePlaceholder)).toBe(
      '10\talpha\n30\tgamma',
    );
  });

  it('セル範囲選択(部分)で false 行が落ちる', async () => {
    const partial: GridSelection = {
      type: 'cell',
      range: { start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
    };
    expect(await copyWith(partial, excludePlaceholder)).toBe('10\n30');
  });

  it('行選択で false 行が落ちる', async () => {
    const rowSel: GridSelection = { type: 'row', startRow: 1, endRow: 2 };
    expect(await copyWith(rowSel, excludePlaceholder)).toBe('30\tgamma');
  });

  it('列選択で false 行が落ちる', async () => {
    const colSel: GridSelection = { type: 'col', startCol: 1, endCol: 1 };
    expect(await copyWith(colSel, excludePlaceholder)).toBe('alpha\ngamma');
  });

  it('ctx にビュー行 index と rowKey(rowModel.getRowKey)が渡る', async () => {
    const seen: Array<[number, { viewRowIndex: number; rowKey: unknown }]> = [];
    await copyWith(wholeGridSelection, (row, ctx) => {
      seen.push([row.id, ctx]);
      return true;
    });
    expect(seen).toEqual([
      [10, { viewRowIndex: 0, rowKey: 10 }],
      [20, { viewRowIndex: 1, rowKey: 20 }],
      [30, { viewRowIndex: 2, rowKey: 30 }],
    ]);
  });

  it('isWholeGridSelected の判定には影響しない(除外は出力時のみ)', () => {
    const uiState: GridUiState = {
      ...createInitialGridUiState(columns),
      selection: wholeGridSelection,
    };
    const { result } = renderHook(() =>
      useGridClipboardController<Row>({
        rows,
        rowModel,
        visibleColumns: columns,
        uiState,
        readOnly: false,
        canEditCell: undefined,
        dispatch: () => {},
        isRowExportable: excludePlaceholder,
      }),
    );
    expect(result.current.isWholeGridSelected).toBe(true);
  });
});