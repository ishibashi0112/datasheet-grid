// 追加(非依存化 ③-11): globalFilteredOrder コントローラのテストです(React 非依存で直接呼ぶ)。
//   hooks/useGlobalFilteredOrder.test.ts(既存 8 件)と対になり、こちらは同期解決と結果合成の純関数、
//   キー変更での中断 / 再開を固定します。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pendingYields } = vi.hoisted(() => ({
  pendingYields: [] as Array<() => void>,
}));
vi.mock('../utils/scheduler', () => ({
  yieldToMain: (): Promise<void> =>
    new Promise<void>((resolve) => {
      pendingYields.push(resolve);
    }),
}));

import {
  ASYNC_GLOBAL_FILTER_ROW_THRESHOLD,
  createGlobalFilteredOrderRunner,
  resolveSyncGlobalFilteredOrder,
  selectGlobalFilteredOrderResult,
} from './globalFilteredOrder';
import { createSourceOrder } from '../logic/filtering';
import type { GridColumn } from '../model/gridTypes.unbound';

const flushYields = async () => {
  const resolvers = pendingYields.splice(0);
  for (const resolve of resolvers) resolve();
  await Promise.resolve();
  await Promise.resolve();
};

let tick = 0;
beforeEach(() => {
  pendingYields.length = 0;
  tick = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (tick += 6));
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Row = { t: string };
const columns: GridColumn<Row>[] = [{ key: 't', width: 100 }];
const rows: Row[] = [{ t: 'aaa' }, { t: 'zzz' }, { t: 'aab' }, { t: 'zzz' }, { t: 'abc' }];
const baseOrder = createSourceOrder(rows.length);

describe('resolveSyncGlobalFilteredOrder / selectGlobalFilteredOrderResult', () => {
  it('フィルター無し / 無効は idle で baseOrder、閾値以下は同期 ready、閾値超は null', () => {
    const key = { rows, baseOrder, columns, needle: 'aa' };
    expect(resolveSyncGlobalFilteredOrder({ ...key, needle: '' }, '', true)).toMatchObject({ status: 'idle', order: baseOrder });
    expect(resolveSyncGlobalFilteredOrder(key, 'aa', false)).toMatchObject({ status: 'idle' });
    const sync = resolveSyncGlobalFilteredOrder(key, 'aa', true);
    expect(sync?.status).toBe('ready');
    expect(Array.from(sync?.order ?? [])).toEqual([0, 2]);
    const big = { ...key, rows: Array.from({ length: ASYNC_GLOBAL_FILTER_ROW_THRESHOLD + 1 }, () => ({ t: 'a' })) };
    expect(resolveSyncGlobalFilteredOrder({ ...big, baseOrder: createSourceOrder(big.rows.length) }, 'a', true)).toBeNull();
  });

  it('結果合成: 同期 > キー一致の完了 > 計算中(行数同じなら直前の完了 order、違えば baseOrder)', () => {
    const key = { rows, baseOrder, columns, needle: 'aa' };
    const readyOrder = new Int32Array([0, 2]);
    expect(
      selectGlobalFilteredOrderResult(null, { ready: { ...key, order: readyOrder, rowsLength: rows.length }, progress: null }, key),
    ).toMatchObject({ status: 'ready', order: readyOrder });
    const otherKey = { ...key, needle: 'ab' };
    expect(
      selectGlobalFilteredOrderResult(
        null,
        { ready: { ...key, order: readyOrder, rowsLength: rows.length }, progress: { ...otherKey, progress: 0.4 } },
        otherKey,
      ),
    ).toMatchObject({ status: 'filtering', order: readyOrder, progress: 0.4 });
    expect(
      selectGlobalFilteredOrderResult(null, { ready: { ...key, order: readyOrder, rowsLength: 99 }, progress: null }, otherKey),
    ).toMatchObject({ status: 'filtering', order: baseOrder, progress: 0 });
  });
});

describe('createGlobalFilteredOrderRunner', () => {
  it('needsAsync のキーで走り、進捗 → 完了を通知する。キー変更で中断して再開', async () => {
    const runner = createGlobalFilteredOrderRunner<Row>();
    const key = { rows, baseOrder, columns, needle: 'aa' };
    runner.update({ ...key, needsAsync: true });
    await flushYields();
    expect(runner.getSnapshot().progress?.progress).toBeGreaterThan(0);
    expect(runner.getSnapshot().ready).toBeNull();
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    expect(Array.from(runner.getSnapshot().ready?.order ?? [])).toEqual([0, 2]);

    const key2 = { ...key, needle: 'zzz' };
    runner.update({ ...key2, needsAsync: true });
    runner.update({ ...key, needle: 'abc', needsAsync: true });
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    expect(runner.getSnapshot().ready?.needle).toBe('abc');
    expect(Array.from(runner.getSnapshot().ready?.order ?? [])).toEqual([4]);

    runner.update({ ...key, needle: 'zz', needsAsync: true });
    runner.dispose();
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    expect(runner.getSnapshot().ready?.needle).toBe('abc');
  });
});