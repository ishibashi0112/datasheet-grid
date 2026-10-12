// 追加(選択範囲の集計): ランナーのテストです(同期 / 時間分割の切り替え、結果の合成、キー変更での中断と再計算、dispose)。
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
  SYNC_SELECTION_AGGREGATE_CELL_LIMIT,
  createSelectionAggregatesRunner,
  resolveSyncSelectionAggregates,
  selectSelectionAggregatesResult,
  type SelectionAggregatesKey,
} from './selectionAggregatesRunner';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

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
  // 1 行ごとに 6ms 進む時計 = 予算 10ms のチャンクは 2 行ずつ。
  vi.spyOn(performance, 'now').mockImplementation(() => (tick += 6));
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Row = { v: number };
const column: GridColumn<Row> = { key: 'v', width: 100 };
const modelOf = (values: number[]): RowModel<Row> => ({
  getRowCount: () => values.length,
  getRow: (index) => ({ v: values[index] }),
  getSourceIndex: (index) => index,
  getRowKey: (index) => index,
});

const keyOf = (rowModel: RowModel<Row>, rowCount: number): SelectionAggregatesKey<Row> => ({
  rowModel,
  target: { startRow: 0, endRow: rowCount - 1, columns: [column] },
});

describe('resolveSyncSelectionAggregates / selectSelectionAggregatesResult', () => {
  it('target なしは null、上限以下は同期で ready、上限超は undefined(時間分割)', () => {
    const model = modelOf([1, 2]);
    expect(resolveSyncSelectionAggregates({ rowModel: model, target: null })).toBeNull();
    expect(resolveSyncSelectionAggregates(keyOf(model, 2))).toMatchObject({ status: 'ready', sum: 3 });
    const big = keyOf(model, SYNC_SELECTION_AGGREGATE_CELL_LIMIT + 1);
    expect(resolveSyncSelectionAggregates(big)).toBeUndefined();
  });

  it('時間分割中はキーが一致する進捗、なければ 0 の computing', () => {
    const key = keyOf(modelOf([1]), 1);
    expect(selectSelectionAggregatesResult(undefined, { ready: null, progress: null }, key)).toMatchObject({
      status: 'computing',
      progress: 0,
      sum: undefined,
    });
    expect(
      selectSelectionAggregatesResult(undefined, { ready: null, progress: { ...key, progress: 0.5 } }, key)?.progress,
    ).toBe(0.5);
    const otherKey = keyOf(modelOf([1]), 1);
    expect(
      selectSelectionAggregatesResult(undefined, { ready: null, progress: { ...otherKey, progress: 0.5 } }, key)?.progress,
    ).toBe(0);
  });
});

describe('createSelectionAggregatesRunner', () => {
  it('時間分割で計算し、進捗を出してから完了の値を公開する', async () => {
    const runner = createSelectionAggregatesRunner<Row>();
    const key = keyOf(modelOf([1, 2, 3, 4, 5, 6]), 6);
    runner.update({ ...key, needsAsync: true });
    await flushYields();
    const progress = selectSelectionAggregatesResult(undefined, runner.getSnapshot(), key);
    expect(progress?.status).toBe('computing');
    expect(progress?.progress).toBeGreaterThan(0);
    for (let i = 0; i < 5; i += 1) await flushYields();
    expect(selectSelectionAggregatesResult(undefined, runner.getSnapshot(), key)).toMatchObject({
      status: 'ready',
      sum: 21,
      count: 6,
      min: 1,
      max: 6,
    });
  });

  it('キーが変わったら走っている計算を中断し、新しいキーで計算し直す(古い結果を公開しない)', async () => {
    const runner = createSelectionAggregatesRunner<Row>();
    const first = keyOf(modelOf([1, 1, 1, 1, 1, 1]), 6);
    runner.update({ ...first, needsAsync: true });
    await flushYields();
    // 編集で rowModel が変わった。
    const second = keyOf(modelOf([2, 2, 2, 2, 2, 2]), 6);
    runner.update({ ...second, needsAsync: true });
    for (let i = 0; i < 8; i += 1) await flushYields();
    const snapshot = runner.getSnapshot();
    expect(snapshot.ready?.rowModel).toBe(second.rowModel);
    expect(selectSelectionAggregatesResult(undefined, snapshot, second)?.sum).toBe(12);
    expect(selectSelectionAggregatesResult(undefined, snapshot, first)?.status).toBe('computing');
  });

  it('同じキーの update では計算し直さない。needsAsync=false へ変われば中断する', async () => {
    const runner = createSelectionAggregatesRunner<Row>();
    const key = keyOf(modelOf([1, 2, 3, 4]), 4);
    runner.update({ ...key, needsAsync: true });
    runner.update({ ...key, needsAsync: true });
    runner.update({ ...key, needsAsync: false });
    for (let i = 0; i < 5; i += 1) await flushYields();
    expect(runner.getSnapshot().ready).toBeNull();
  });

  it('計算中の dispose で中断し、同じ args の update で再開する(StrictMode の再マウント)', async () => {
    const runner = createSelectionAggregatesRunner<Row>();
    const key = keyOf(modelOf([1, 2, 3, 4]), 4);
    runner.update({ ...key, needsAsync: true });
    runner.dispose();
    for (let i = 0; i < 4; i += 1) await flushYields();
    expect(runner.getSnapshot().ready).toBeNull();
    runner.update({ ...key, needsAsync: true });
    for (let i = 0; i < 4; i += 1) await flushYields();
    expect(selectSelectionAggregatesResult(undefined, runner.getSnapshot(), key)?.sum).toBe(10);
  });
});