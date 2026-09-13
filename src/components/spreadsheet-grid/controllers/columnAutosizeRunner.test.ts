// 追加(非依存化 ③-9): columnAutosizeRunner のテストです(React 非依存で直接呼ぶ)。
//   hooks/useColumnAutosizeRunner.test.ts(特性テスト)と対になり、こちらは update 前の no-op・
//   dispose での中断・isAutosizing の購読を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridColumn, RowModel } from '../model/gridTypes';

const pendingYields: Array<() => void> = [];
vi.mock('../utils/scheduler', () => ({
  yieldToMain: (): Promise<void> =>
    new Promise<void>((resolve) => {
      pendingYields.push(resolve);
    }),
}));
const flushYields = async () => {
  const resolvers = pendingYields.splice(0);
  for (const resolve of resolvers) resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const collected: unknown[] = [];
vi.mock('../logic/columnAutosize', () => ({
  canMeasureAutosize: () => true,
  createColumnWidthAccumulator: (columns: Array<{ key: string }>) => ({
    collect: (row: unknown) => {
      collected.push(row);
    },
    finalize: () => Object.fromEntries(columns.map((c) => [c.key, 120])),
  }),
}));

import { createAutoSizeOnDataTrigger, createColumnAutosizeRunner } from './columnAutosizeRunner';

type Row = { id: number };
const columns: GridColumn<Row>[] = [{ key: 'id', title: 'ID', width: 80 }];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});

let tick = 0;
beforeEach(() => {
  collected.length = 0;
  pendingYields.length = 0;
  tick = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => (tick += 6));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('columnAutosizeRunner', () => {
  it('update 前は no-op、update 後は全行を集めて dispatch し、isAutosizing の購読者へ通知する', async () => {
    const runner = createColumnAutosizeRunner<Row>();
    await runner.runAutosize(columns);
    expect(collected).toEqual([]);

    const dispatch = vi.fn();
    runner.update({
      rowModel: makeRowModel([{ id: 1 }, { id: 2 }]),
      gridRootRef: { current: null },
      columnWidths: {},
      dispatch,
    });
    const listener = vi.fn();
    runner.subscribe(listener);
    const promise = runner.runAutosize(columns);
    vi.advanceTimersByTime(200);
    expect(runner.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    await flushYields();
    await flushYields();
    await promise;
    expect(collected).toEqual([{ id: 1 }, { id: 2 }]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'columnWidths/sync', widths: { id: 120 } });
    expect(runner.getSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('dispose は進行中の run を中断し、overlay を出さない', async () => {
    const runner = createColumnAutosizeRunner<Row>();
    const dispatch = vi.fn();
    runner.update({
      rowModel: makeRowModel([{ id: 1 }, { id: 2 }, { id: 3 }]),
      gridRootRef: { current: null },
      columnWidths: {},
      dispatch,
    });
    const promise = runner.runAutosize(columns);
    runner.dispose();
    vi.advanceTimersByTime(500);
    expect(runner.getSnapshot()).toBe(false);
    await flushYields();
    await flushYields();
    await flushYields();
    await promise;
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// 追加(本体分解 E-6c): autoSize on data トリガー(旧 effect の deps 相当が変わったときだけ判定)。
describe('createAutoSizeOnDataTrigger', () => {
  it("'onMount' は初回にデータが載った一度きり、'onDataChange' は rows 参照が変わるたび、visibleColumns 変化では発火しない", () => {
    const runAutosize = vi.fn(async () => {});
    const trigger = createAutoSizeOnDataTrigger<Row>();
    const rows1 = [{ id: 1 }];
    trigger.update({ mode: 'onMount', isServerSide: false, rows: [], visibleColumns: columns, runAutosize });
    expect(runAutosize).not.toHaveBeenCalled();
    trigger.update({ mode: 'onMount', isServerSide: false, rows: rows1, visibleColumns: columns, runAutosize });
    expect(runAutosize).toHaveBeenCalledTimes(1);
    expect(runAutosize).toHaveBeenCalledWith(columns);
    // 列構成だけ変わっても発火しない / rows が変わっても onMount は二度目以降を抑止。
    trigger.update({ mode: 'onMount', isServerSide: false, rows: rows1, visibleColumns: [...columns], runAutosize });
    trigger.update({ mode: 'onMount', isServerSide: false, rows: [{ id: 2 }], visibleColumns: columns, runAutosize });
    expect(runAutosize).toHaveBeenCalledTimes(1);

    const onChange = createAutoSizeOnDataTrigger<Row>();
    onChange.update({ mode: 'onDataChange', isServerSide: false, rows: rows1, visibleColumns: columns, runAutosize });
    onChange.update({ mode: 'onDataChange', isServerSide: false, rows: [{ id: 3 }], visibleColumns: columns, runAutosize });
    expect(runAutosize).toHaveBeenCalledTimes(3);
    // serverSide では発火しない。
    onChange.update({ mode: 'onDataChange', isServerSide: true, rows: [{ id: 4 }], visibleColumns: columns, runAutosize });
    expect(runAutosize).toHaveBeenCalledTimes(3);
  });
});