// 追加(1.3.0 / Solid 版の品質の段 2-3): ハンドルと状態の所見の結合テストです(Solid 版の handleState.test.tsx と同じ場面)。
//   S4-22: 外したグリッドのハンドル(変数に残したもの)の applyRows / undo などが、外したときの古い行で親の行を上書きしていた。
//   S4-09: 選んだ行を消した後も選択のキーが残り、getSelectedRowKeys() / getSelectedRowCount() が getSelectedRowData() と
//   食い違っていた。
//   S4-03: selectRange の直後(描き直す前)の exportCsv({ scope: 'selection' }) が古い選択(空)で出ていた。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, GridRowKey, RowSelectionModel, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 160 }];
const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `r${i + 1}` }));

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let currentRows: Row[] = [];
let replaceRows: (rows: Row[]) => void = () => {};
let setShown: (shown: boolean) => void = () => {};

describe('外したグリッドのハンドル(S4-22)', () => {
  function Harness({ onRef, onChange }: { onRef: (handle: SpreadsheetGridHandle<Row>) => void; onChange: () => void }) {
    const [rows, setRows] = useState(makeRows(3));
    const [shown, setShownState] = useState(true);
    useEffect(() => {
      replaceRows = setRows;
      setShown = setShownState;
    }, []);
    useEffect(() => {
      currentRows = rows;
    }, [rows]);
    return shown ? (
      <SpreadsheetGrid<Row>
        ref={(handle) => {
          if (handle) onRef(handle);
        }}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={(next) => {
          onChange();
          setRows(next);
        }}
      />
    ) : null;
  }

  it('状態を変えるメソッドは何もせず(開発時に 1 回知らせる)、読むメソッドは外したときの値を返す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let grid: SpreadsheetGridHandle<Row> | null = null;
    let changes = 0;
    render(
      <Harness
        onRef={(handle) => {
          grid = handle;
        }}
        onChange={() => {
          changes += 1;
        }}
      />,
    );
    const handle = grid as SpreadsheetGridHandle<Row> | null;
    expect(handle).not.toBeNull();
    if (handle === null) return;
    act(() => {
      setShown(false);
    });
    // 隠したまま親で行を足す。
    act(() => {
      replaceRows([...currentRows, { id: 99, name: '足した行' }]);
    });
    act(() => {
      handle.applyRows((prev) => prev.slice(1));
      handle.undo();
      handle.selectCell(0, 0);
    });
    expect(handle.startEditing(0, 0)).toBe(false);
    expect(changes).toBe(0);
    expect(currentRows.map((row) => row.id)).toEqual([1, 2, 3, 99]);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('外したグリッドのハンドル'))).toHaveLength(1);
    expect(handle.getState().filters.globalText).toBe('');
    expect(handle.exportCsv()).toContain('r1');
  });
});

describe('消した行の選択(S4-09)', () => {
  function Harness({
    onRef,
    initialRows = makeRows(4),
    selectedRowKeys,
    onRowSelectionChange,
  }: {
    onRef: (handle: SpreadsheetGridHandle<Row>) => void;
    initialRows?: Row[];
    selectedRowKeys?: GridRowKey[];
    onRowSelectionChange?: (model: RowSelectionModel) => void;
  }) {
    const [rows, setRows] = useState(initialRows);
    useEffect(() => {
      replaceRows = setRows;
    }, []);
    useEffect(() => {
      currentRows = rows;
    }, [rows]);
    return (
      <SpreadsheetGrid<Row>
        ref={(handle) => {
          if (handle) onRef(handle);
        }}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={setRows}
        enableRowSelection
        {...(selectedRowKeys === undefined ? {} : { selectedRowKeys })}
        onRowSelectionChange={onRowSelectionChange}
      />
    );
  }

  it('選んだ行を消すと選択から外し、数・キー・データがそろう(onRowSelectionChange も来る)', () => {
    const onRowSelectionChange = vi.fn<(model: RowSelectionModel) => void>();
    let grid: SpreadsheetGridHandle<Row> | null = null;
    render(
      <Harness
        onRef={(handle) => {
          grid = handle;
        }}
        onRowSelectionChange={onRowSelectionChange}
      />,
    );
    const handle = grid as unknown as SpreadsheetGridHandle<Row>;
    act(() => {
      handle.setRowSelection({ type: 'include', rowKeys: [2, 3] });
    });
    onRowSelectionChange.mockClear();
    // 行 2 を消す(行 3 は残る)。
    act(() => {
      replaceRows(currentRows.filter((row) => row.id !== 2));
    });
    expect(handle.getSelectedRowKeys()).toEqual([3]);
    expect(handle.getSelectedRowCount()).toBe(1);
    expect(handle.getSelectedRowData().map((row) => row.id)).toEqual([3]);
    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    expect(onRowSelectionChange.mock.calls[0]?.[0]).toEqual({ type: 'include', rowKeys: [3] });
    // セルの編集(行は同じ)では外さない・知らせない。
    onRowSelectionChange.mockClear();
    act(() => {
      replaceRows(currentRows.map((row) => (row.id === 3 ? { ...row, name: 'x' } : row)));
    });
    expect(handle.getSelectedRowKeys()).toEqual([3]);
    expect(onRowSelectionChange).not.toHaveBeenCalled();
  });

  it('全選択(exclude)で除いた行を消しても、数は残った行で数える', () => {
    let grid: SpreadsheetGridHandle<Row> | null = null;
    render(
      <Harness
        onRef={(handle) => {
          grid = handle;
        }}
      />,
    );
    const handle = grid as unknown as SpreadsheetGridHandle<Row>;
    act(() => {
      handle.setRowSelection({ type: 'exclude', rowKeys: [1] });
    });
    expect(handle.getSelectedRowCount()).toBe(3);
    act(() => {
      replaceRows(currentRows.filter((row) => row.id !== 1));
    });
    expect(handle.getSelectedRowCount()).toBe(3);
    expect(handle.getSelectedRowKeys()).toEqual([2, 3, 4]);
    expect(handle.getRowSelection()).toEqual({ type: 'exclude', rowKeys: [] });
  });

  it('controlled: 行を読み込む前に渡したキーは外さず、読み込んだ後に消した行のキーは onRowSelectionChange で外す', () => {
    const onRowSelectionChange = vi.fn<(model: RowSelectionModel) => void>();
    let grid: SpreadsheetGridHandle<Row> | null = null;
    render(
      <Harness
        onRef={(handle) => {
          grid = handle;
        }}
        initialRows={[]}
        selectedRowKeys={[2]}
        onRowSelectionChange={onRowSelectionChange}
      />,
    );
    const handle = grid as unknown as SpreadsheetGridHandle<Row>;
    act(() => {
      replaceRows(makeRows(3));
    });
    expect(onRowSelectionChange).not.toHaveBeenCalled();
    expect(handle.getSelectedRowData().map((row) => row.id)).toEqual([2]);
    act(() => {
      replaceRows(currentRows.filter((row) => row.id !== 2));
    });
    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    expect(onRowSelectionChange.mock.calls[0]?.[0]).toEqual({ type: 'include', rowKeys: [] });
  });
});

describe('選択を変えた直後のエクスポート(S4-03)', () => {
  it('selectRange の直後の exportCsv({ scope: "selection" }) は新しい選択で出す', () => {
    let grid: SpreadsheetGridHandle<Row> | null = null;
    render(
      <SpreadsheetGrid<Row>
        ref={(handle) => {
          if (handle) grid = handle;
        }}
        rows={makeRows(4)}
        columns={columns}
        rowKeyGetter={(row) => row.id}
      />,
    );
    const handle = grid as unknown as SpreadsheetGridHandle<Row>;
    let csv = '';
    act(() => {
      handle.selectRange({ start: { row: 1, col: 0 }, end: { row: 2, col: 0 } });
      csv = handle.exportCsv({ scope: 'selection', includeHeaders: false });
    });
    expect(csv.split(/\r?\n/).filter(Boolean)).toEqual(['r2', 'r3']);
  });
});