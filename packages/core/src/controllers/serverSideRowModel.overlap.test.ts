// 追加(1.0 前の最終チェック FC-04 / FC-05 / FC-32): SSRM の書き戻しで同じ行の書き込みが重なったときと、dataSource が
//   Promise を返す前に同期で throw したときの回帰テストです。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSideRowModel } from './serverSideRowModel';
import type { ServerSideDataSource, ServerSideUpdateRowsParams } from '../model/gridTypes.unbound';

type Row = { id: number; a: string; b: string };

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const colA = { key: 'a', title: 'a', width: 80 } as const;
const colB = { key: 'b', title: 'b', width: 80 } as const;

type Pending = { params: ServerSideUpdateRowsParams<Row>; resolve: () => void; reject: (e: unknown) => void };

const setup = async (extra: Record<string, unknown> = {}) => {
  const pending: Pending[] = [];
  const dataSource: ServerSideDataSource<Row> = {
    initialRowCount: 10,
    blockSize: 100,
    getRows: async ({ startIndex, endIndex }) => ({
      rows: Array.from({ length: Math.min(endIndex, 10) - startIndex }, (_, i) => ({ id: startIndex + i, a: 'a0', b: 'b0' })),
      totalRowCount: 10,
    }),
    updateRows: (params) =>
      new Promise<void>((resolve, reject) => {
        pending.push({ params, resolve, reject });
      }),
  };
  const writeErrors: unknown[] = [];
  const states: { state: string; cells: readonly { rowKey: unknown; columnKeys: readonly string[] }[] }[] = [];
  const args = {
    dataSource,
    rowKeyGetter: (row: Row) => row.id,
    query: {},
    queryKey: 'q',
    onWriteError: (e: unknown) => writeErrors.push(e),
    onWriteStateChange: (e: (typeof states)[number]) => states.push(e),
    ...extra,
  };
  const model = createServerSideRowModel<Row>(args);
  model.update(args);
  model.requestRange(0, 10);
  vi.runAllTimers();
  await flush();
  return { model, pending, writeErrors, states };
};

describe('FC-04: 同じ行の書き込みの応答が逆の順で届く', () => {
  it('新しい書き込みが先に成功し、古い書き込みの成功が後から届いても、新しい値は戻らない', async () => {
    const { model, pending } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    model.applyCellEdits([{ viewIndex: 3, column: colB, value: 'b1' }]);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a1', b: 'b1' });
    pending[1].resolve();
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a1', b: 'b1' });
    pending[0].resolve();
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a1', b: 'b1' });
    // 次の編集の row / previousRow にも古い値は入らない
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a2' }]);
    expect(pending[2].params.updates[0].previousRow).toEqual({ id: 3, a: 'a1', b: 'b1' });
    model.dispose();
  });

  it('同じセルを 2 回変えて応答が逆順でも、後で確定した値(新しい方)が残る', async () => {
    const { model, pending } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'old' }]);
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'new' }]);
    pending[1].resolve();
    await flush();
    pending[0].resolve();
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)?.a).toBe('new');
    model.dispose();
  });
});

describe('FC-05: 同じ行の古い書き込みが失敗し、新しい書き込みが保存中', () => {
  it('失敗した値は外れ、新しい書き込みの成功でも戻らない', async () => {
    const { model, pending, writeErrors } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'BAD' }]);
    model.applyCellEdits([{ viewIndex: 3, column: colB, value: 'b1' }]);
    pending[0].reject(new Error('invalid a'));
    await flush();
    expect(writeErrors).toHaveLength(1);
    expect(model.getSnapshot().writeError).toEqual({ failedRowCount: 1 });
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b1' });
    pending[1].resolve();
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b1' });
    model.dispose();
  });

  it('保存状態の印: 同じセルの新しい書き込みが保存中なら、古い書き込みの完了で ok にしない', async () => {
    const { model, pending, states } = await setup();
    model.applyCellEdits([
      { viewIndex: 3, column: colA, value: 'x' },
      { viewIndex: 3, column: colB, value: 'y' },
    ]);
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'z' }]);
    pending[0].resolve();
    await flush();
    const ok = states.find((event) => event.state === 'ok');
    expect(ok?.cells).toEqual([{ rowKey: 3, columnKeys: ['b'] }]);
    pending[1].resolve();
    await flush();
    expect(states.filter((event) => event.state === 'ok').at(-1)?.cells).toEqual([{ rowKey: 3, columnKeys: ['a'] }]);
    model.dispose();
  });
});

describe('FC-32: dataSource が Promise を返す前に同期で throw する', () => {
  it('updateRows: 失敗として扱い、楽観値を戻して失敗バーを出す', async () => {
    const errors: unknown[] = [];
    const states: string[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      initialRowCount: 10,
      getRows: async () => ({ rows: Array.from({ length: 10 }, (_, i) => ({ id: i, a: 'a0', b: 'b0' })), totalRowCount: 10 }),
      updateRows: (() => {
        throw new Error('sync');
      }) as never,
    };
    const args = {
      dataSource,
      rowKeyGetter: (row: Row) => row.id,
      query: {},
      queryKey: 'q',
      onWriteError: (e: unknown) => errors.push(e),
      onWriteStateChange: (e: { state: string }) => states.push(e.state),
    };
    const model = createServerSideRowModel<Row>(args);
    model.update(args);
    model.requestRange(0, 10);
    vi.runAllTimers();
    await flush();
    expect(() => model.applyCellEdits([{ viewIndex: 2, column: colA, value: 'X' }])).not.toThrow();
    await flush();
    expect(model.getSnapshot().rowModel.getRow(2)?.a).toBe('a0');
    expect(model.getSnapshot().writeError).toEqual({ failedRowCount: 1 });
    expect(errors).toHaveLength(1);
    expect(states).toEqual(['pending', 'failed']);
    model.dispose();
  });

  it('getRows: 読み込みの失敗として扱い、再試行で取り直せる', async () => {
    let calls = 0;
    let fail = true;
    const errors: unknown[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      initialRowCount: 300,
      blockSize: 100,
      getRows: (({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
        calls += 1;
        if (fail) throw new Error('sync getRows');
        return Promise.resolve({
          rows: Array.from({ length: endIndex - startIndex }, (_, i) => ({ id: startIndex + i, a: '', b: '' })),
          totalRowCount: 300,
        });
      }) as never,
    };
    const args = { dataSource, rowKeyGetter: (row: Row) => row.id, query: {}, queryKey: 'q', onLoadError: (e: unknown) => errors.push(e) };
    const model = createServerSideRowModel<Row>(args);
    expect(() => model.update(args)).not.toThrow();
    model.requestRange(0, 50);
    expect(() => vi.runAllTimers()).not.toThrow();
    await flush();
    expect(calls).toBe(1);
    expect(model.getSnapshot().loadError).toEqual({ failedBlockCount: 1 });
    expect(errors).toHaveLength(1);
    fail = false;
    model.retryFailedBlocks();
    await flush();
    expect(calls).toBe(2);
    expect(model.isRowLoaded(0)).toBe(true);
    model.dispose();
  });

  it('初回(件数が分からないときの block 0)の同期 throw でも update は例外を出さない', async () => {
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (() => {
        throw new Error('sync getRows');
      }) as never,
    };
    const errors: unknown[] = [];
    const args = { dataSource, rowKeyGetter: (row: Row) => row.id, query: {}, queryKey: 'q', onLoadError: (e: unknown) => errors.push(e) };
    const model = createServerSideRowModel<Row>(args);
    expect(() => model.update(args)).not.toThrow();
    await flush();
    expect(errors).toHaveLength(1);
    expect(model.getSnapshot().loadError).toEqual({ failedBlockCount: 1 });
    model.dispose();
  });
});