// 追加(非依存化 ③-9): useColumnAutosizeRunner の特性テストです(抽出前に現状の挙動を固定)。
//   計測ロジック(logic/columnAutosize)はモックし、「時間分割で全行を collect → finalize → dispatch」
//   「遅延後に isAutosizing が立ち、完了で下りる」「世代切替 / rowModel 差し替えで中断」を検証します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { GridColumn, RowModel } from '../model/gridTypes';

// yieldToMain をゲート化(テストが flushYields で進める)。
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

// 計測ロジックはモック: 行の値を集めて finalize で幅表にします。
const collected: unknown[] = [];
vi.mock('../logic/columnAutosize', () => ({
  canMeasureAutosize: () => true,
  createColumnWidthAccumulator: (columns: Array<{ key: string }>) => ({
    collect: (row: unknown) => {
      collected.push(row);
    },
    finalize: () =>
      Object.fromEntries(columns.map((c) => [c.key, 100 + collected.length])),
  }),
}));

// performance.now を 6ms 刻みで進め、1 チャンク(予算 10ms)あたり 1〜2 行で yield させます
//   (旧実装: 開始 6 → 判定 12 で 1 行、chunkedLoop: 必ず 1 行進めてから判定)。
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
  cleanup();
});

import { useColumnAutosizeRunner } from './useColumnAutosizeRunner';

type Row = { id: number };
const columns: GridColumn<Row>[] = [{ key: 'id', title: 'ID', width: 80 }];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});

const setup = (rows: Row[]) => {
  const rowModelRef = { current: makeRowModel(rows) };
  const gridRootRef = { current: null as HTMLElement | null };
  const columnWidthsRef = { current: {} as Record<string, number> };
  const dispatch = vi.fn();
  const view = renderHook(() =>
    useColumnAutosizeRunner<Row>({ rowModelRef, gridRootRef, columnWidthsRef, dispatch }),
  );
  return { ...view, rowModelRef, dispatch };
};

describe('useColumnAutosizeRunner(特性テスト)', () => {
  it('全行を時間分割で集めて finalize し syncColumnWidths を dispatch、遅延後の overlay フラグは完了で下りる', async () => {
    const t = setup([{ id: 1 }, { id: 2 }, { id: 3 }]);
    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = t.result.current.runAutosize(columns);
    });
    expect(t.result.current.isAutosizing).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(t.result.current.isAutosizing).toBe(true);
    await act(async () => {
      await flushYields();
      await flushYields();
      await flushYields();
      await promise;
    });
    expect(collected).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(t.dispatch).toHaveBeenCalledTimes(1);
    expect(t.dispatch.mock.calls[0][0]).toMatchObject({ type: 'columnWidths/sync' });
    expect(t.result.current.isAutosizing).toBe(false);
  });

  it('実行中に再実行すると前の run は中断され、新しい run だけが dispatch する', async () => {
    // 5 行にして必ず 1 回以上 yield(= 中断判定点)が入るようにします(チャンクの粒度に依存しない)。
    const t = setup([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = t.result.current.runAutosize(columns);
    });
    act(() => {
      second = t.result.current.runAutosize(columns);
    });
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        await flushYields();
      }
      await first;
      await second;
    });
    expect(t.dispatch).toHaveBeenCalledTimes(1);
  });

  it('rowModel が差し替わったら中断して dispatch しない。列 0 本は即 return', async () => {
    const t = setup([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = t.result.current.runAutosize(columns);
    });
    t.rowModelRef.current = makeRowModel([{ id: 9 }]);
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        await flushYields();
      }
      await promise;
    });
    expect(t.dispatch).not.toHaveBeenCalled();
    await act(async () => {
      await t.result.current.runAutosize([]);
    });
    expect(t.dispatch).not.toHaveBeenCalled();
  });
});