// 追加(非依存化 ③-12): serverSideRowModel コントローラのテストです(React 非依存で直接呼ぶ)。
//   hooks/useServerSideRowModel.test.ts(既存 30 件)が挙動の大半を固定しているため、こちらは
//   生成時の初期値・update による queryKey / refreshToken 検出・スナップショット通知・dispose を確認します。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSideRowModel } from './serverSideRowModel';
import type { ServerSideDataSource } from '../model/gridTypes';

type Row = { v: number };

const makeDataSource = (opts: { initialRowCount?: number; total?: number } = {}) => {
  const total = opts.total ?? 250;
  const getRows = vi.fn(
    async ({ startIndex, endIndex, signal }: { startIndex: number; endIndex: number; signal: AbortSignal }) => {
      await Promise.resolve();
      if (signal.aborted) {
        throw new Error('aborted');
      }
      const rows: Row[] = [];
      for (let i = startIndex; i < Math.min(endIndex, total); i += 1) rows.push({ v: i });
      return { rows, totalRowCount: total };
    },
  );
  const dataSource: ServerSideDataSource<Row> = {
    getRows,
    initialRowCount: opts.initialRowCount,
    blockSize: 100,
  };
  return { dataSource, getRows };
};

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('serverSideRowModel', () => {
  it('生成時は initialRowCount を反映し、初回 update(queryKey 初回)で件数未知なら block 0 を取得する', async () => {
    const { dataSource, getRows } = makeDataSource();
    const controller = createServerSideRowModel<Row>({
      dataSource,
      rowKeyGetter: (row) => row.v,
      query: { sort: [], filters: null, globalText: '' } as never,
      queryKey: 'q1',
    });
    expect(controller.getSnapshot().rowCount).toBe(0);
    expect(getRows).not.toHaveBeenCalled();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.update({ dataSource, rowKeyGetter: (row) => row.v, query: {} as never, queryKey: 'q1' });
    expect(getRows).toHaveBeenCalledTimes(1);
    await flush();
    const snapshot = controller.getSnapshot();
    expect(snapshot.rowCount).toBe(250);
    expect(snapshot.rowModel.getRow(3)).toEqual({ v: 3 });
    expect(controller.isRowLoaded(150)).toBe(false);
    expect(listener).toHaveBeenCalled();

    const known = createServerSideRowModel<Row>({
      dataSource: makeDataSource({ initialRowCount: 250 }).dataSource,
      rowKeyGetter: (row) => row.v,
      query: {} as never,
      queryKey: 'q1',
    });
    expect(known.getSnapshot().rowCount).toBe(250);
  });

  it('同じ queryKey の update では再取得せず、queryKey 変化と refreshToken 変化で取り直す。dispose で abort', async () => {
    const { dataSource, getRows } = makeDataSource({ initialRowCount: 250 });
    const base = { dataSource, rowKeyGetter: (row: Row) => row.v, query: {} as never, queryKey: 'q1', refreshToken: 1 };
    const controller = createServerSideRowModel<Row>(base);
    controller.update(base);
    controller.update(base);
    expect(getRows).not.toHaveBeenCalled();
    controller.update({ ...base, queryKey: 'q2' });
    expect(getRows).toHaveBeenCalledTimes(1);
    await flush();
    const before = controller.getSnapshot().rowModel;
    controller.update({ ...base, queryKey: 'q2', refreshToken: 2 });
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().rowModel).not.toBe(before);

    controller.requestRange(150, 180);
    vi.advanceTimersByTime(200);
    expect(getRows).toHaveBeenCalledTimes(3);
    const lastSignal = getRows.mock.calls[2][0].signal as AbortSignal;
    controller.dispose();
    expect(lastSignal.aborted).toBe(true);
  });
});