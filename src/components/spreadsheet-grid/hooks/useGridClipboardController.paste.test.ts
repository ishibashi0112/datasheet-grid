// 追加(非依存化 ③-8): useGridClipboardController のペースト特性テストです(抽出前に現状の挙動を固定)。
//   clientSide(行 / 列の自動拡張と選択範囲の更新)、serverSide(applyServerSideCellEdits 経路)、
//   readOnly / activeCell なし / 空テキストの no-op を検証します。コピーは既存の
//   isRowExportable テストが 4 経路を固定済みです。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ClipboardEvent } from 'react';
import { useGridClipboardController } from './useGridClipboardController';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiAction } from '../model/gridActions';
import type { CellCoord, GridColumn, GridUiState, RowModel } from '../model/gridTypes';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; extra?: string };
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 120 },
];
const makeRows = (): Row[] => [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});

const pasteEvent = (text: string) =>
  ({
    clipboardData: { getData: () => text },
    preventDefault: vi.fn(),
  }) as unknown as ClipboardEvent<HTMLDivElement>;

const setup = (overrides: {
  activeCell?: CellCoord | null;
  readOnly?: boolean;
  serverSide?: boolean;
  withGrowth?: boolean;
} = {}) => {
  const rows = makeRows();
  const uiState: GridUiState = {
    ...createInitialGridUiState(columns),
    activeCell: overrides.activeCell === undefined ? { row: 1, col: 1 } : overrides.activeCell,
  };
  const dispatch = vi.fn<(a: GridUiAction) => void>();
  const onRowsChange = vi.fn();
  const onColumnsChange = vi.fn();
  const applyServerSideCellEdits = vi.fn<
    (edits: ServerSideCellEditInput<Row>[]) => number
  >(() => 1);
  const view = renderHook(() =>
    useGridClipboardController<Row>({
      rows,
      rowModel: makeRowModel(rows),
      visibleColumns: columns,
      uiState,
      readOnly: overrides.readOnly ?? false,
      canEditCell: undefined,
      createRow: overrides.withGrowth ? () => ({ id: 99, name: '' }) : undefined,
      createOverflowColumn: overrides.withGrowth
        ? (index) => ({ key: `extra${index}`, title: `X${index}`, width: 80 })
        : undefined,
      onRowsChange: overrides.serverSide ? undefined : onRowsChange,
      onColumnsChange: overrides.withGrowth ? onColumnsChange : undefined,
      applyServerSideCellEdits: overrides.serverSide ? applyServerSideCellEdits : undefined,
      dispatch,
    }),
  );
  return { ...view, dispatch, onRowsChange, onColumnsChange, applyServerSideCellEdits };
};
const types = (dispatch: ReturnType<typeof vi.fn<(a: GridUiAction) => void>>) =>
  dispatch.mock.calls.map(([a]) => a.type);

describe('useGridClipboardController ペースト(特性テスト)', () => {
  it('clientSide: 行 / 列を自動拡張して書き込み、貼り付け範囲を選択する', () => {
    const t = setup({ withGrowth: true });
    const event = pasteEvent('A\tB\nC\tD');
    act(() => {
      t.result.current.handlePaste(event);
    });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(t.onColumnsChange).toHaveBeenCalledTimes(1);
    expect(t.onColumnsChange.mock.calls[0][0]).toHaveLength(3);
    expect(t.onRowsChange).toHaveBeenCalledTimes(1);
    const next = t.onRowsChange.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(next).toHaveLength(3);
    expect(next[1]).toMatchObject({ id: 2, name: 'A', extra2: 'B' });
    expect(next[2]).toMatchObject({ id: 99, name: 'C', extra2: 'D' });
    expect(types(t.dispatch)).toEqual(['selection/start', 'selection/update', 'selection/end', 'cell/activate']);
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 2, col: 2 } });
  });

  it('clientSide: 拡張手段が無ければ既存範囲にだけ書き込む', () => {
    const t = setup();
    act(() => {
      t.result.current.handlePaste(pasteEvent('A\tB\nC\tD'));
    });
    const next = t.onRowsChange.mock.calls[0][0] as Row[];
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: 2, name: 'A' });
    expect(t.onColumnsChange).not.toHaveBeenCalled();
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 2, col: 2 } });
  });

  it('serverSide: applyServerSideCellEdits へ編集を渡し、範囲は既存の行数 / 列数で clamp', () => {
    const t = setup({ serverSide: true, activeCell: { row: 0, col: 1 } });
    act(() => {
      t.result.current.handlePaste(pasteEvent('A\tB\nC\tD\nE\tF'));
    });
    expect(t.applyServerSideCellEdits).toHaveBeenCalledTimes(1);
    const edits = t.applyServerSideCellEdits.mock.calls[0][0];
    expect(edits.map((e) => [e.viewIndex, e.value])).toEqual([[0, 'A'], [1, 'C']]);
    expect(t.onRowsChange).not.toHaveBeenCalled();
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 1, col: 1 } });
  });

  it('readOnly / activeCell なし / 空テキストでは何もしない', () => {
    const ro = setup({ readOnly: true });
    const roEvent = pasteEvent('A');
    act(() => {
      ro.result.current.handlePaste(roEvent);
    });
    expect(roEvent.preventDefault).not.toHaveBeenCalled();
    expect(ro.onRowsChange).not.toHaveBeenCalled();

    const none = setup({ activeCell: null });
    act(() => {
      none.result.current.handlePaste(pasteEvent('A'));
    });
    expect(none.onRowsChange).not.toHaveBeenCalled();

    const empty = setup();
    const emptyEvent = pasteEvent('');
    act(() => {
      empty.result.current.handlePaste(emptyEvent);
    });
    expect(emptyEvent.preventDefault).not.toHaveBeenCalled();
    expect(empty.onRowsChange).not.toHaveBeenCalled();
  });
});