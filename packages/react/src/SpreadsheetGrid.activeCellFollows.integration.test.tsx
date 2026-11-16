// 追加(1.2.0 / 2026-11-09 実アプリの総点検 B-04): 並びが変わったときのアクティブセル(activeCellFollows)の結合テストです。
//   - 既定の 'position' は表示位置に残る(1.1 までと同じ。同じ位置に来た別の行を指し、onActiveCellChange が呼ばれる)。
//   - 'row' は押した行に付いていく(ソートしたまま値が変わる表)。onActiveCellChange は位置だけ動いたときは呼ばない。
//   - 'row' の選択: アクティブセルの行だけの範囲は一緒に動き、何行かにまたがる範囲は 1 セルになる。列選択はそのまま。
//   - 追う行が消えたときは位置に残り、その後はその位置の行を追う。編集中は editController が付いていく(変えない)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridCellRef, GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string; change: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '銘柄', width: 120, editable: true },
  { key: 'change', title: '前日比', width: 100, editable: true, editor: { type: 'number' } },
];

const initialRows: Row[] = [
  { id: 1, name: 'A', change: 5 },
  { id: 2, name: 'B', change: 4 },
  { id: 3, name: 'C', change: 3 },
  { id: 4, name: 'D', change: 2 },
  { id: 5, name: 'E', change: 1 },
];

type HarnessHandle = { setRows: (next: Row[]) => void };

function Harness({
  gridRef,
  harnessRef,
  props,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  harnessRef: { current: HarnessHandle | null };
  props: Partial<SpreadsheetGridProps<Row>>;
}) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    harnessRef.current = { setRows };
  }, [harnessRef]);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      rows={rows}
      columns={columns}
      rowKeyGetter={(row) => row.id}
      onRowsChange={setRows}
      // 前日比の大きい順(値が変わると並びが入れ替わる)。
      initialState={{ sort: [{ columnKey: 'change', direction: 'desc' }] }}
      {...props}
    />
  );
}

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const gridRef = createRef<SpreadsheetGridHandle<Row>>();
  const harnessRef: { current: HarnessHandle | null } = { current: null };
  render(<Harness gridRef={gridRef} harnessRef={harnessRef} props={props} />);
  const grid = () => gridRef.current!;
  const setRows = (next: Row[]) => {
    act(() => {
      harnessRef.current!.setRows(next);
    });
  };
  // 表示位置 row の銘柄(ハンドルの getViewRowIndex で今の rows から探す)。
  const nameAt = (row: number) => currentRows.find((r) => grid().getViewRowIndex(r.id) === row)?.name;
  return { grid, setRows, nameAt };
};

// 今の rows(ソース順。withRows で差し替えるたびに覚える)。
let currentRows: Row[] = initialRows;

describe('並びが変わったときのアクティブセル(activeCellFollows。B-04)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
    currentRows = initialRows;
  });

  const withRows = (next: Row[]) => {
    currentRows = next;
    return next;
  };

  it("既定の 'position' は表示位置に残り、同じ位置に来た別の行を指す(onActiveCellChange も呼ばれる)", () => {
    const onActiveCellChange = vi.fn<(cell: GridCellRef<Row> | null) => void>();
    const { grid, setRows, nameAt } = setup({ onActiveCellChange });
    act(() => {
      grid().selectCell(1, 1);
    });
    expect(nameAt(1)).toBe('B');
    onActiveCellChange.mockClear();
    // B の前日比が最下位へ。
    setRows(withRows(initialRows.map((row) => (row.name === 'B' ? { ...row, change: 0 } : row))));
    expect(grid().getActiveCell()).toEqual({ row: 1, col: 1 });
    expect(nameAt(1)).toBe('C');
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);
    expect(onActiveCellChange.mock.calls[0]?.[0]?.rowKey).toBe(3);
  });

  it("'row' は押した行に付いていき、位置だけ動いたときは onActiveCellChange を呼ばない", () => {
    const onActiveCellChange = vi.fn<(cell: GridCellRef<Row> | null) => void>();
    const { grid, setRows, nameAt } = setup({ activeCellFollows: 'row', onActiveCellChange });
    act(() => {
      grid().selectCell(1, 1);
    });
    onActiveCellChange.mockClear();
    setRows(withRows(initialRows.map((row) => (row.name === 'B' ? { ...row, change: 0 } : row))));
    expect(nameAt(4)).toBe('B');
    expect(grid().getActiveCell()).toEqual({ row: 4, col: 1 });
    expect(grid().getSelection()).toEqual({ type: 'cell', range: { start: { row: 4, col: 1 }, end: { row: 4, col: 1 } } });
    expect(onActiveCellChange).not.toHaveBeenCalled();
    // 上へ戻る。
    setRows(withRows(initialRows.map((row) => (row.name === 'B' ? { ...row, change: 9 } : row))));
    expect(grid().getActiveCell()).toEqual({ row: 0, col: 1 });
    expect(onActiveCellChange).not.toHaveBeenCalled();
    // セルを動かしたときは今までどおり呼ばれ、その行を新しく追う。
    act(() => {
      grid().selectCell(2, 0);
    });
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);
    expect(nameAt(2)).toBe('C');
    setRows(withRows(initialRows.map((row) => (row.name === 'C' ? { ...row, change: 10 } : row))));
    expect(grid().getActiveCell()).toEqual({ row: 0, col: 0 });
    expect(nameAt(0)).toBe('C');
    expect(onActiveCellChange).toHaveBeenCalledTimes(1);
  });

  it("'row' の選択: 行の中の範囲は一緒に動き、何行かの範囲は 1 セルに、列選択はそのまま", () => {
    const { grid, setRows, nameAt } = setup({ activeCellFollows: 'row' });
    // 同じ行の 2 列(アクティブセルは左上)。
    act(() => {
      grid().selectRange({ start: { row: 1, col: 0 }, end: { row: 1, col: 1 } });
    });
    setRows(withRows(initialRows.map((row) => (row.name === 'B' ? { ...row, change: 0 } : row))));
    expect(grid().getActiveCell()).toEqual({ row: 4, col: 0 });
    expect(grid().getSelection()).toEqual({ type: 'cell', range: { start: { row: 4, col: 0 }, end: { row: 4, col: 1 } } });
    // 何行かの範囲 → 外してアクティブセルの 1 セル。
    act(() => {
      grid().selectRange({ start: { row: 0, col: 0 }, end: { row: 2, col: 1 } });
    });
    const activeName = nameAt(grid().getActiveCell()!.row);
    setRows(withRows(currentRows.map((row) => (row.name === activeName ? { ...row, change: -1 } : row))));
    const active = grid().getActiveCell()!;
    expect(nameAt(active.row)).toBe(activeName);
    expect(active.row).toBe(4);
    expect(grid().getSelection()).toEqual({ type: 'cell', range: { start: active, end: active } });
  });

  it("'row' で追う行が消えたときは位置に残り、その後はその位置の行を追う", () => {
    const { grid, setRows, nameAt } = setup({ activeCellFollows: 'row' });
    act(() => {
      grid().selectCell(1, 1);
    });
    // B を消す。
    setRows(withRows(initialRows.filter((row) => row.name !== 'B')));
    expect(grid().getActiveCell()).toEqual({ row: 1, col: 1 });
    expect(nameAt(1)).toBe('C');
    // 今度は C を追う。
    setRows(withRows(currentRows.map((row) => (row.name === 'C' ? { ...row, change: 0 } : row))));
    expect(nameAt(3)).toBe('C');
    expect(grid().getActiveCell()).toEqual({ row: 3, col: 1 });
  });

  it("'row' でも編集中は edit が行に付いていき、確定はその行へ書く", () => {
    const { grid, setRows } = setup({ activeCellFollows: 'row' });
    act(() => {
      grid().selectCell(1, 0);
    });
    act(() => {
      grid().startEditing();
    });
    setRows(withRows(initialRows.map((row) => (row.name === 'B' ? { ...row, change: 0 } : row))));
    // editController が行キーで付いていく(アクティブセル = 編集中のセルも動く)。
    expect(grid().getActiveCell()).toEqual({ row: 4, col: 0 });
  });
});