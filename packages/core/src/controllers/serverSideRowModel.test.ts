// 追加(非依存化 ③-12): serverSideRowModel コントローラのテストです(React 非依存で直接呼ぶ)。
//   hooks/useServerSideRowModel.test.ts(既存 30 件)が挙動の大半を固定しているため、こちらは
//   生成時の初期値・update による queryKey / refreshToken 検出・スナップショット通知・dispose を確認します。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSideRowModel } from './serverSideRowModel';
import type { ServerSideDataSource } from '../model/gridTypes.unbound';

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

  // 追加(audit C-1): StrictMode(生成 → update → dispose → 同じインスタンスへ再 update)で、
  //   initialRowCount 未指定でも abort された初回取得を取り直してグリッドが空のままにならない。
  it('dispose 後の再 update(StrictMode 相当)で abort された block 0 を取り直す', async () => {
    const { dataSource, getRows } = makeDataSource();
    const common = { dataSource, rowKeyGetter: (row: Row) => row.v, query: {} as never, queryKey: 'q1' };
    const controller = createServerSideRowModel<Row>(common);
    controller.update(common);
    expect(getRows).toHaveBeenCalledTimes(1);
    controller.dispose(); // 1 回目の取得は abort される
    controller.update(common); // 再接続(同じ queryKey)
    expect(getRows).toHaveBeenCalledTimes(2);
    await flush();
    expect(controller.getSnapshot().rowCount).toBe(250);
    expect(controller.getSnapshot().rowModel.getRow(0)).toEqual({ v: 0 });
    // 取得済み(件数既知・block 0 あり)なら再 update で取り直さない。
    controller.dispose();
    controller.update(common);
    expect(getRows).toHaveBeenCalledTimes(2);
  });

  // 追加(監査 C-7): 失敗ブロックはスクロール(可視窓の変化)では再要求せず、retryFailedBlocks で取り直す。
  it('失敗ブロックはスクロールでは再要求せず onLoadError も 1 回だけ。retryFailedBlocks で取り直す', async () => {
    let fail = true;
    const getRows = vi.fn(async ({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
      await Promise.resolve();
      if (fail) {
        throw new Error('boom');
      }
      const rows: Row[] = [];
      for (let i = startIndex; i < Math.min(endIndex, 250); i += 1) rows.push({ v: i });
      return { rows, totalRowCount: 250 };
    });
    const onLoadError = vi.fn();
    const dataSource: ServerSideDataSource<Row> = { getRows, initialRowCount: 250, blockSize: 100 };
    const common = { dataSource, rowKeyGetter: (row: Row) => row.v, query: {} as never, queryKey: 'q1', onLoadError };
    const controller = createServerSideRowModel<Row>(common);
    controller.update(common);
    controller.requestRange(0, 50);
    vi.runAllTimers();
    await flush();
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().loadError).toEqual({ failedBlockCount: 1 });

    // 1 行ずつスクロールしても失敗ブロックは取り直さない
    controller.requestRange(1, 51);
    vi.runAllTimers();
    controller.requestRange(2, 52);
    vi.runAllTimers();
    await flush();
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(onLoadError).toHaveBeenCalledTimes(1);

    // 明示再試行で取り直す
    fail = false;
    controller.retryFailedBlocks();
    await flush();
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().loadError).toBeNull();
    expect(controller.isRowLoaded(10)).toBe(true);
  });

  it('dispose 後の再 update は確立済みの可視レンジも取り直す', async () => {
    const { dataSource, getRows } = makeDataSource({ initialRowCount: 250 });
    const common = { dataSource, rowKeyGetter: (row: Row) => row.v, query: {} as never, queryKey: 'q1' };
    const controller = createServerSideRowModel<Row>(common);
    controller.update(common);
    controller.requestRange(120, 160); // block 1
    vi.runAllTimers();
    expect(getRows).toHaveBeenCalledTimes(1);
    controller.dispose(); // in-flight が abort される
    controller.update(common);
    expect(getRows).toHaveBeenCalledTimes(2);
    await flush();
    expect(controller.isRowLoaded(150)).toBe(true);
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

  // 追加(motion-7 / M-9): 書き戻しのセル単位の状態通知(pending → ok / failed、refresh で cleared)。
  it('applyCellEdits は onWriteStateChange に pending → ok / failed を rowKey × 変更列で通知し、refresh 後の決着は cleared', async () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    const column = { key: 'v', title: 'v', width: 80 } as const;
    const makeWritable = (outcome: 'ok' | 'fail') => {
      const base = makeDataSource({ initialRowCount: 250 });
      const dataSource: ServerSideDataSource<Row> = {
        ...base.dataSource,
        updateRows: () => (outcome === 'ok' ? Promise.resolve() : Promise.reject(new Error('x'))),
      };
      return dataSource;
    };
    const events: Array<{ state: string; cells: unknown }> = [];
    const onWriteStateChange = (event: { state: string; cells: unknown }) => events.push(event);
    const okController = createServerSideRowModel<Row>({
      dataSource: makeWritable('ok'),
      rowKeyGetter: (row) => row.v,
      query: {} as never,
      queryKey: 'q1',
      onWriteStateChange,
    });
    okController.update({ dataSource: makeWritable('ok'), rowKeyGetter: (row) => row.v, query: {} as never, queryKey: 'q1', onWriteStateChange });
    okController.requestRange(0, 50);
    vi.runAllTimers();
    await flush();
    okController.applyCellEdits([{ viewIndex: 3, column, value: 99 }]);
    expect(events.map((e) => e.state)).toEqual(['pending']);
    expect(events[0].cells).toEqual([{ rowKey: 3, columnKeys: ['v'] }]);
    await flush();
    expect(events.map((e) => e.state)).toEqual(['pending', 'ok']);

    events.length = 0;
    const failController = createServerSideRowModel<Row>({
      dataSource: makeWritable('fail'),
      rowKeyGetter: (row) => row.v,
      query: {} as never,
      queryKey: 'q1',
      onWriteStateChange,
      onWriteError: () => {},
    });
    failController.update({ dataSource: makeWritable('fail'), rowKeyGetter: (row) => row.v, query: {} as never, queryKey: 'q1', onWriteStateChange, onWriteError: () => {} });
    failController.requestRange(0, 50);
    vi.runAllTimers();
    await flush();
    failController.applyCellEdits([{ viewIndex: 1, column, value: 5 }]);
    await flush();
    expect(events.map((e) => e.state)).toEqual(['pending', 'failed']);

    events.length = 0;
    failController.applyCellEdits([{ viewIndex: 2, column, value: 6 }]);
    failController.refresh();
    vi.runAllTimers();
    await flush();
    expect(events.map((e) => e.state)).toEqual(['pending', 'cleared']);
    okController.dispose();
    failController.dispose();
  });
});
