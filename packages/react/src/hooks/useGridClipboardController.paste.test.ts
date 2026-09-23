// 追加(非依存化 ③-8): useGridClipboardController のペースト特性テストです(抽出前に現状の挙動を固定)。
//   clientSide(行 / 列の自動拡張と選択範囲の更新)、serverSide(applyServerSideCellEdits 経路)、
//   readOnly / activeCell なし / 空テキストの no-op を検証します。コピーは既存の
//   isRowExportable テストが 4 経路を固定済みです。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ClipboardEvent } from 'react';
import { useGridClipboardController } from './useGridClipboardController';
import { createInitialGridUiState } from '@ishibashi0112/spreadsheet-grid-core/model/gridReducer';
import type { GridUiAction } from '@ishibashi0112/spreadsheet-grid-core/model/gridActions';
import type { CellCoord, GridColumn, GridUiState, RowModel } from '../model/gridTypes';
import type { ServerSideCellEditInput } from '@ishibashi0112/spreadsheet-grid-core/logic/serverSideEdits';

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
// 追加(label-row ③): ラベル行(getLabelRow)を読み飛ばして貼り付けます(行を落とさず次のデータ行へ続ける)。
describe('useGridClipboardController ペースト × ラベル行', () => {
  // [L] a [L] b (+ 末尾追記)
  type LRow = { id: number; kind?: 'label'; name: string };
  const makeLabelRows = (): LRow[] => [
    { id: 10, kind: 'label', name: 'S1' },
    { id: 1, name: 'a' },
    { id: 11, kind: 'label', name: 'S2' },
    { id: 2, name: 'b' },
  ];
  const makeLabelRowModel = (rows: LRow[]): RowModel<LRow> => ({
    getRowCount: () => rows.length,
    getRow: (i) => (rows[i]?.kind === 'label' ? (undefined as unknown as LRow) : rows[i]),
    getSourceIndex: (i) => (rows[i]?.kind === 'label' ? (undefined as unknown as number) : i),
    getRowKey: (i) => rows[i]?.id ?? i,
    getLabelRow: (i) =>
      rows[i]?.kind === 'label'
        ? { kind: 'label', row: rows[i], sourceIndex: i, label: rows[i].name, sectionRowCount: 0 }
        : undefined,
  });
  const labelColumns: GridColumn<LRow>[] = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'name', title: 'Name', width: 120 },
  ];
  const setupLabel = (opts: { serverSide?: boolean; withGrowth?: boolean } = {}) => {
    const rows = makeLabelRows();
    const uiState: GridUiState = { ...createInitialGridUiState(labelColumns), activeCell: { row: 1, col: 1 } };
    const dispatch = vi.fn<(a: GridUiAction) => void>();
    const onRowsChange = vi.fn();
    const applyServerSideCellEdits = vi.fn<(edits: ServerSideCellEditInput<LRow>[]) => number>(() => 1);
    const view = renderHook(() =>
      useGridClipboardController<LRow>({
        rows,
        rowModel: makeLabelRowModel(rows),
        visibleColumns: labelColumns,
        uiState,
        readOnly: false,
        canEditCell: undefined,
        createRow: opts.withGrowth ? () => ({ id: 99, name: '' }) : undefined,
        createOverflowColumn: undefined,
        onRowsChange: opts.serverSide ? undefined : onRowsChange,
        onColumnsChange: undefined,
        applyServerSideCellEdits: opts.serverSide ? applyServerSideCellEdits : undefined,
        dispatch,
      }),
    );
    return { ...view, dispatch, onRowsChange, applyServerSideCellEdits };
  };

  it('clientSide: ラベル行を飛ばして a → b の順に書き込み、範囲の終端は最後の貼り付け先行', () => {
    const t = setupLabel();
    act(() => {
      t.result.current.handlePaste(pasteEvent('A\nB'));
    });
    const next = t.onRowsChange.mock.calls[0][0] as LRow[];
    expect(next).toHaveLength(4);
    expect(next[1]).toMatchObject({ id: 1, name: 'A' });
    expect(next[2]).toMatchObject({ id: 11, kind: 'label', name: 'S2' });
    expect(next[3]).toMatchObject({ id: 2, name: 'B' });
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 3, col: 1 } });
  });

  it('clientSide: 末尾を超えるぶんは createRow で追記する(ラベル行を飛ばした先の連番)', () => {
    const t = setupLabel({ withGrowth: true });
    act(() => {
      t.result.current.handlePaste(pasteEvent('A\nB\nC'));
    });
    const next = t.onRowsChange.mock.calls[0][0] as LRow[];
    expect(next).toHaveLength(5);
    expect(next[3]).toMatchObject({ id: 2, name: 'B' });
    expect(next[4]).toMatchObject({ id: 99, name: 'C' });
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 4, col: 1 } });
  });

  it('serverSide: 編集の viewIndex はラベル行を飛ばしたデータ行になる', () => {
    const t = setupLabel({ serverSide: true });
    act(() => {
      t.result.current.handlePaste(pasteEvent('A\nB\nC'));
    });
    const edits = t.applyServerSideCellEdits.mock.calls[0][0];
    expect(edits.map((e) => [e.viewIndex, e.value])).toEqual([[1, 'A'], [3, 'B']]);
    // 範囲は行数で clamp。
    expect(t.dispatch.mock.calls[1][0]).toMatchObject({ cell: { row: 3, col: 1 } });
  });
});
