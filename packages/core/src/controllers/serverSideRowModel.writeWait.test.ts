// 追加(dogfood DF-07 / DF-09): SSRM の書き戻しで、保存中に取り直したとき(refresh / クエリ変化)と、上書き済みの変更の
//   保存が失敗したときの回帰テストです。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSideRowModel, SERVER_SIDE_WRITE_WAIT_MS } from './serverSideRowModel';
import type { ServerSideDataSource, ServerSideUpdateRowsParams } from '../model/gridTypes.unbound';

type Row = { id: number; a: string; b: string };

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
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
type WriteErrorCall = { error: unknown; updates: ServerSideUpdateRowsParams<Row>['updates'] };

// 書き込みが成功したら(resolve したら)サーバーの行へ反映する擬似サーバーです。
const setup = async () => {
  const serverRows: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: i, a: 'a0', b: 'b0' }));
  const pending: Pending[] = [];
  const getRowsCalls: { startIndex: number; endIndex: number }[] = [];
  const dataSource: ServerSideDataSource<Row> = {
    initialRowCount: 10,
    blockSize: 100,
    getRows: async ({ startIndex, endIndex }) => {
      getRowsCalls.push({ startIndex, endIndex });
      return {
        rows: serverRows.slice(startIndex, Math.min(endIndex, serverRows.length)).map((row) => ({ ...row })),
        totalRowCount: serverRows.length,
      };
    },
    updateRows: (params) =>
      new Promise<void>((resolve, reject) => {
        pending.push({
          params,
          resolve: () => {
            for (const update of params.updates) {
              const index = serverRows.findIndex((row) => row.id === update.rowKey);
              if (index >= 0) serverRows[index] = { ...update.row };
            }
            resolve();
          },
          reject,
        });
      }),
  };
  const writeErrors: WriteErrorCall[] = [];
  const states: { state: string; cells: readonly { rowKey: unknown; columnKeys: readonly string[] }[] }[] = [];
  const baseArgs = {
    dataSource,
    rowKeyGetter: (row: Row) => row.id,
    query: {},
    queryKey: 'q',
    onWriteError: (error: unknown, params: { updates: ServerSideUpdateRowsParams<Row>['updates'] }) =>
      writeErrors.push({ error, updates: params.updates }),
    onWriteStateChange: (e: (typeof states)[number]) => states.push(e),
  };
  const model = createServerSideRowModel<Row>(baseArgs);
  model.update(baseArgs);
  model.requestRange(0, 10);
  vi.runAllTimers();
  await flush();
  return { model, pending, writeErrors, states, getRowsCalls, serverRows, baseArgs };
};

describe('DF-07: 保存中に取り直すと、保存の決着を待ってから取り直す', () => {
  it('refresh: 保存が成功するまで取得を待ち、成功後に取り直した行はサーバーに反映済みの値', async () => {
    const { model, pending, states, getRowsCalls, writeErrors } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    const before = getRowsCalls.length;
    model.refresh();
    vi.advanceTimersByTime(500);
    await flush();
    // 保存中は取らない(行は未ロード = スケルトン。古い値を出さない)
    expect(getRowsCalls.length).toBe(before);
    expect(model.getSnapshot().rowModel.getRow(3)).toBeUndefined();
    pending[0].resolve();
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before + 1);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a1', b: 'b0' });
    expect(states.map((s) => s.state)).toEqual(['pending', 'ok']);
    expect(states[1].cells).toEqual([{ rowKey: 3, columnKeys: ['a'] }]);
    expect(writeErrors).toEqual([]);
    expect(model.getSnapshot().writeError).toBeNull();
    model.dispose();
  });

  it('refresh: 保存が失敗したら保存失敗バーと onWriteError で知らせ、取り直した行はサーバーの値(元の値)', async () => {
    const { model, pending, states, getRowsCalls, writeErrors } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    const before = getRowsCalls.length;
    model.refresh();
    await flush();
    const failure = new Error('ng');
    pending[0].reject(failure);
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before + 1);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b0' });
    expect(model.getSnapshot().writeError).toEqual({ failedRowCount: 1 });
    expect(writeErrors).toHaveLength(1);
    expect(writeErrors[0].error).toBe(failure);
    expect(writeErrors[0].updates[0].rowKey).toBe(3);
    expect(states.map((s) => s.state)).toEqual(['pending', 'failed']);
    expect(states[1].cells).toEqual([{ rowKey: 3, columnKeys: ['a'] }]);
    model.dispose();
  });

  it('クエリ変化でも保存の決着を待ってから block 0 を取り直す', async () => {
    const { model, pending, getRowsCalls, baseArgs } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    const before = getRowsCalls.length;
    model.update({ ...baseArgs, queryKey: 'q2' });
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before);
    pending[0].resolve();
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before + 1);
    expect(getRowsCalls[before]?.startIndex).toBe(0);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a1', b: 'b0' });
    model.dispose();
  });

  it('保存が返ってこなくても、上限の時間を過ぎたら取り直す(その後の決着も知らせる)', async () => {
    const { model, pending, getRowsCalls, states } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    const before = getRowsCalls.length;
    model.refresh();
    await flush();
    vi.advanceTimersByTime(SERVER_SIDE_WRITE_WAIT_MS - 1);
    await flush();
    expect(getRowsCalls.length).toBe(before);
    vi.advanceTimersByTime(1);
    await flush();
    expect(getRowsCalls.length).toBe(before + 1);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b0' });
    // 遅れて成功しても、取り直した行(位置が変わりうる)へは書かない。印は ok
    pending[0].resolve();
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b0' });
    expect(states.map((s) => s.state)).toEqual(['pending', 'ok']);
    model.dispose();
  });

  it('保存中の書き込みが複数あれば、すべて決着するまで待つ。保存中でなければ refresh はすぐ取り直す', async () => {
    const { model, pending, getRowsCalls } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    model.applyCellEdits([{ viewIndex: 4, column: colB, value: 'b1' }]);
    const before = getRowsCalls.length;
    model.refresh();
    await flush();
    pending[0].resolve();
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before);
    pending[1].resolve();
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before + 1);
    expect(model.getSnapshot().rowModel.getRow(4)).toEqual({ id: 4, a: 'a0', b: 'b1' });
    // 保存中でなければ待たない
    model.refresh();
    await flush();
    expect(getRowsCalls.length).toBe(before + 2);
    model.dispose();
  });

  it('待っている間にもう一度 refresh しても取り直しは 1 回', async () => {
    const { model, pending, getRowsCalls } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    const before = getRowsCalls.length;
    model.refresh();
    model.refresh();
    await flush();
    pending[0].resolve();
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before + 1);
    model.dispose();
  });

  it('待っている間に unmount したら取り直さず、後の決着は cleared', async () => {
    const { model, pending, getRowsCalls, states, writeErrors } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    const before = getRowsCalls.length;
    model.refresh();
    await flush();
    model.dispose();
    pending[0].reject(new Error('ng'));
    await flush();
    vi.advanceTimersByTime(500);
    await flush();
    expect(getRowsCalls.length).toBe(before);
    expect(states.map((s) => s.state)).toEqual(['pending', 'cleared']);
    expect(writeErrors).toEqual([]);
  });

  it('取り直した後の編集は、古い書き込みの決着に影響されない', async () => {
    const { model, pending } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a1' }]);
    model.refresh();
    await flush();
    vi.advanceTimersByTime(SERVER_SIDE_WRITE_WAIT_MS);
    await flush();
    // 取り直した行(a0)を編集
    model.applyCellEdits([{ viewIndex: 3, column: colB, value: 'b2' }]);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b2' });
    // 古い書き込みの失敗は、新しい楽観値を巻き戻さない
    pending[0].reject(new Error('ng'));
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b2' });
    model.dispose();
  });
});

describe('DF-09: 上書き済みの変更の保存が失敗しても知らせない', () => {
  it('同じセルを新しい書き込みが変えていれば、古い書き込みの失敗はバーも onWriteError も出さない', async () => {
    const { model, pending, writeErrors } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'old' }]);
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'new' }]);
    pending[0].reject(new Error('ng'));
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'new', b: 'b0' });
    expect(model.getSnapshot().writeError).toBeNull();
    expect(writeErrors).toEqual([]);
    // 新しい書き込みが失敗したら、元に戻して知らせる
    pending[1].reject(new Error('ng2'));
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b0' });
    expect(model.getSnapshot().writeError).toEqual({ failedRowCount: 1 });
    expect(writeErrors).toHaveLength(1);
    expect(writeErrors[0].updates[0].changes.map((c) => c.columnKey)).toEqual(['a']);
    model.dispose();
  });

  it('新しい書き込みが先に成功していても、古い書き込みの失敗は知らせない', async () => {
    const { model, pending, writeErrors } = await setup();
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'old' }]);
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'new' }]);
    pending[1].resolve();
    await flush();
    pending[0].reject(new Error('ng'));
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'new', b: 'b0' });
    expect(model.getSnapshot().writeError).toBeNull();
    expect(writeErrors).toEqual([]);
    model.dispose();
  });

  it('一部の変更だけ上書きされていれば、元に戻した変更だけを知らせる', async () => {
    const { model, pending, writeErrors } = await setup();
    // 1 つ目の書き込みで a と b を変え、2 つ目の書き込みで a だけ変える
    model.applyCellEdits([
      { viewIndex: 3, column: colA, value: 'a1' },
      { viewIndex: 3, column: colB, value: 'b1' },
    ]);
    model.applyCellEdits([{ viewIndex: 3, column: colA, value: 'a2' }]);
    pending[0].reject(new Error('ng'));
    await flush();
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a2', b: 'b0' });
    expect(model.getSnapshot().writeError).toEqual({ failedRowCount: 1 });
    expect(writeErrors).toHaveLength(1);
    expect(writeErrors[0].updates).toHaveLength(1);
    expect(writeErrors[0].updates[0].changes.map((c) => c.columnKey)).toEqual(['b']);
    model.dispose();
  });

  it('複数行の書き込みが失敗したら、元に戻した行の数だけ数える', async () => {
    const { model, pending, writeErrors } = await setup();
    model.applyCellEdits([
      { viewIndex: 3, column: colA, value: 'a1' },
      { viewIndex: 4, column: colA, value: 'a1' },
    ]);
    model.applyCellEdits([{ viewIndex: 4, column: colA, value: 'a2' }]);
    pending[0].reject(new Error('ng'));
    await flush();
    expect(model.getSnapshot().writeError).toEqual({ failedRowCount: 1 });
    expect(writeErrors[0].updates.map((u) => u.rowKey)).toEqual([3]);
    expect(model.getSnapshot().rowModel.getRow(3)).toEqual({ id: 3, a: 'a0', b: 'b0' });
    expect(model.getSnapshot().rowModel.getRow(4)).toEqual({ id: 4, a: 'a2', b: 'b0' });
    model.dispose();
  });
});