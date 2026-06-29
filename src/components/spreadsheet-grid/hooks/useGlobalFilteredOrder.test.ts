// F-async: useGlobalFilteredOrder の挙動テスト(時間分割グローバルフィルタの恒久化)。
//   本番コードは無改修で、純述語(rowMatchesGlobalText)/同期版(filterOrderByGlobalText)の上に乗る
//   「フックの状態遷移・前回結果維持・中断 / stale 排除・進捗」を検証します。
//
//   このファイルだけ環境を jsdom にします(renderHook が DOM を要するため)。グローバルは node のまま
//   (vitest.config.ts は無改修)で、下記ドックブロックで本ファイルのみ上書きします。
//
//   決定性の出し方(本番無改修のための都合):
//     - yieldToMain を vi.mock でゲート化し、yield の解決をテストが手動で進めます
//       (実 MessageChannel / 実時間に依存しない)。
//     - performance.now を単調増加スタブにして inner loop(CHUNK_BUDGET_MS=10ms)のチャンク境界を
//       決定化します(STEP=0.001ms ⇒ ROWS=50,001 行で数チャンク)。
//   アサーションは性質ベース(進捗の単調非減少 / filtering を最低 1 回観測 / 最終 order が
//   filterOrderByGlobalText の同期参照とバイト等価 / 計算中は order 参照が安定)で、チャンク数の
//   揺らぎに依存しません。中断 / stale 排除は useDeferredValue の遅延に依存しない経路
//   (rows / baseOrder の即時変化・unmount)で検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// yieldToMain をゲート化します。run() は await yieldToMain() でここに溜まり、テストが flushYield で
//   解決するまで先へ進みません。vi.mock のファクトリから参照するため vi.hoisted で巻き上げます。
const { pendingYields } = vi.hoisted(() => ({
  pendingYields: [] as Array<() => void>,
}));
vi.mock('../utils/scheduler', () => ({
  yieldToMain: (): Promise<void> =>
    new Promise<void>((resolve) => {
      pendingYields.push(resolve);
    }),
}));

import { renderHook, act } from '@testing-library/react';
import {
  useGlobalFilteredOrder,
  ASYNC_GLOBAL_FILTER_ROW_THRESHOLD,
} from './useGlobalFilteredOrder';
import {
  createSourceOrder,
  filterOrderByGlobalText,
  type RowOrder,
} from '../logic/filtering';
import type { GridColumn } from '../model/gridTypes';

// inner loop の budget(10ms)に対し now() 1 回あたり STEP ms 進めます。10/STEP ≒ rows/chunk。
const STEP = 0.001;
let nowValue = 0;

beforeEach(() => {
  nowValue = 0;
  pendingYields.length = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    nowValue += STEP;
    return nowValue;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Row = { t: string };
const columns: GridColumn<Row>[] = [{ key: 't', width: 100 }];

// t 列が偶数 index='aaa' / 奇数 index='zzz'。needle 'aaa'→偶数, 'zzz'→奇数 で結果が割れます。
const makeRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ t: i % 2 === 0 ? 'aaa' : 'zzz' }));
// 全行同値の母集合(rows 差し替えでの中断 / 正しさ検証に使います)。
const makeUniform = (n: number, value: string): Row[] =>
  Array.from({ length: n }, () => ({ t: value }));

const asArray = (order: RowOrder): number[] => Array.from(order);

const THRESHOLD = ASYNC_GLOBAL_FILTER_ROW_THRESHOLD;
const ASYNC_N = THRESHOLD + 1; // 50,001 = 非同期
const SYNC_N = 1_000; // 同期

type HookArgs = Parameters<typeof useGlobalFilteredOrder<Row>>[0];

// 溜まった yield をすべて解決し、後続の同期 run と setState を act 内で流します。
const flushYield = async (): Promise<void> => {
  await act(async () => {
    const resolvers = pendingYields.splice(0);
    resolvers.forEach((resolve) => resolve());
    await Promise.resolve();
  });
};

describe('useGlobalFilteredOrder - 同期経路(従来挙動・チラつきなし)', () => {
  it('空文字は idle で baseOrder を返し、非同期 run を起こさない', () => {
    const rows = makeRows(SYNC_N);
    const baseOrder = createSourceOrder(rows.length);
    const { result } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: '   ',
        enabled: true,
      }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.order).toBe(baseOrder);
    expect(result.current.progress).toBe(1);
    expect(pendingYields.length).toBe(0);
  });

  it('enabled=false なら大規模・非空でも idle / baseOrder(走らせない)', () => {
    const rows = makeRows(ASYNC_N);
    const baseOrder = createSourceOrder(rows.length);
    const { result } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: 'aaa',
        enabled: false,
      }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.order).toBe(baseOrder);
    expect(pendingYields.length).toBe(0);
  });

  it('しきい値以下は同期 ready で filterOrderByGlobalText とバイト等価(yield 無し)', () => {
    const rows = makeRows(SYNC_N);
    const baseOrder = createSourceOrder(rows.length);
    const { result } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: 'aaa',
        enabled: true,
      }),
    );
    expect(result.current.status).toBe('ready');
    expect(pendingYields.length).toBe(0);
    expect(asArray(result.current.order)).toEqual(
      asArray(filterOrderByGlobalText(rows, baseOrder, columns, 'aaa')),
    );
  });

  it('ちょうど 50,000 行は同期(境界: 50,000=同期 / 50,001=非同期)', () => {
    const rows = makeRows(THRESHOLD); // 50,000
    const baseOrder = createSourceOrder(rows.length);
    const { result } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: 'aaa',
        enabled: true,
      }),
    );
    expect(result.current.status).toBe('ready');
    expect(pendingYields.length).toBe(0);
  });
});

describe('useGlobalFilteredOrder - 非同期経路(大規模・時間分割)', () => {
  it('filtering(進捗単調増)->ready で同期参照とバイト等価', async () => {
    const rows = makeRows(ASYNC_N);
    const baseOrder = createSourceOrder(rows.length);
    const { result } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: 'aaa',
        enabled: true,
      }),
    );

    // 初期は filtering。order は前回確定(初期は baseOrder)を表示します。
    expect(result.current.status).toBe('filtering');
    expect(result.current.order).toBe(baseOrder);

    const progresses: number[] = [result.current.progress];
    let guard = 0;
    while (result.current.status !== 'ready' && guard < 100) {
      await flushYield();
      progresses.push(result.current.progress);
      guard += 1;
    }

    expect(result.current.status).toBe('ready');
    // 進捗は単調非減少で 1 に到達。
    for (let i = 1; i < progresses.length; i += 1) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
    }
    // filtering(0<p<1)を最低 1 回観測している。
    expect(progresses.some((p) => p > 0 && p < 1)).toBe(true);
    expect(result.current.progress).toBe(1);

    // 結果は同期一括フィルタとバイト等価(刻み方非依存)。
    expect(asArray(result.current.order)).toEqual(
      asArray(filterOrderByGlobalText(rows, baseOrder, columns, 'aaa')),
    );
  });

  it('計算中は order 参照が安定(下流スキップの担保)', async () => {
    const rows = makeRows(ASYNC_N);
    const baseOrder = createSourceOrder(rows.length);
    const { result } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: 'aaa',
        enabled: true,
      }),
    );
    expect(result.current.status).toBe('filtering');
    const orderRef = result.current.order;
    await flushYield(); // 進捗 1 tick(まだ ready ではない)
    expect(result.current.status).toBe('filtering');
    // filtering の間は order 参照が変わらない(progress だけ更新)。
    expect(result.current.order).toBe(orderRef);
  });
});

describe('useGlobalFilteredOrder - 中断 / stale 排除', () => {
  it('計算中に unmount しても例外なく中断され、以後 setState されない', async () => {
    const rows = makeRows(ASYNC_N);
    const baseOrder = createSourceOrder(rows.length);
    const { result, unmount } = renderHook(() =>
      useGlobalFilteredOrder({
        rows,
        baseOrder,
        columns,
        globalText: 'aaa',
        enabled: true,
      }),
    );
    expect(result.current.status).toBe('filtering');
    await flushYield(); // in-flight
    expect(() => unmount()).not.toThrow();
    // unmount 後に残った yield を解決しても cancelled で何も起きない(例外が出ないことを確認)。
    await flushYield();
  });

  it('計算中に母集合(rows)を差し替えると in-flight は中断され、最終結果は新母集合のみ', async () => {
    const rows1 = makeUniform(ASYNC_N, 'aaa'); // 'aaa' は全行一致(旧 run の結果は全件)
    const baseOrder1 = createSourceOrder(rows1.length);
    const { result, rerender } = renderHook(
      (props: HookArgs) => useGlobalFilteredOrder(props),
      {
        initialProps: {
          rows: rows1,
          baseOrder: baseOrder1,
          columns,
          globalText: 'aaa',
          enabled: true,
        } as HookArgs,
      },
    );

    expect(result.current.status).toBe('filtering');
    await flushYield(); // 旧 run('aaa' on rows1)を 1 チャンク進める

    // rows を全 'zzz' へ差し替え(rows / baseOrder の identity 変化で effect が即 cleanup→中断)。
    //   globalText は不変のため useDeferredValue の遅延は挟みません(rows は遅延対象外)。
    const rows2 = makeUniform(ASYNC_N, 'zzz'); // 'aaa' は一致なし → 期待は空
    const baseOrder2 = createSourceOrder(rows2.length);
    rerender({
      rows: rows2,
      baseOrder: baseOrder2,
      columns,
      globalText: 'aaa',
      enabled: true,
    } as HookArgs);

    let guard = 0;
    while (result.current.status !== 'ready' && guard < 100) {
      await flushYield();
      guard += 1;
    }

    // 最終結果は新母集合 rows2 に対する 'aaa'(=一致なし=空)。旧 run の全件結果が混入しない。
    expect(result.current.status).toBe('ready');
    expect(asArray(result.current.order)).toEqual(
      asArray(filterOrderByGlobalText(rows2, baseOrder2, columns, 'aaa')),
    );
    expect(result.current.order.length).toBe(0);
  });
});