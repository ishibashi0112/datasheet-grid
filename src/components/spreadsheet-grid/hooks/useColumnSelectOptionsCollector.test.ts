// V-2: useColumnSelectOptionsCollector の挙動テスト(DS-4 #1 の非同期収集の恒久化)。
//   バックログ #1 の残り(collector フックの挙動テスト)を満たします。本番コードは無改修で、
//   等価性ロジック(logic/selectOptions)の上に乗る「フックの状態遷移・中断・stale 排除」を検証します。
//
//   このファイルだけ環境を jsdom にします(renderHook が DOM を要するため)。グローバルは node のまま
//   (vitest.config.ts は無改修)で、下記ドックブロックで本ファイルのみ上書きします。
//
//   決定性の出し方(本番無改修のための都合):
//     - yieldToMain を vi.mock でゲート化し、yield の解決をテストが手動で進めます
//       (実 MessageChannel / 実時間に依存しない)。
//     - performance.now を単調増加スタブにして inner loop(CHUNK_BUDGET_MS=10ms)のチャンク境界を
//       決定化します(STEP=0.001ms ⇒ ROWS=50,001 行で数チャンク)。
//   アサーションは性質ベース(進捗の単調非減少 / collecting を最低 1 回観測 / 最終結果が
//   collectSelectOptions の同期参照とバイト等価)で、チャンク数の揺らぎに依存しません。
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
  useColumnSelectOptionsCollector,
  ASYNC_SELECT_COLLECT_ROW_THRESHOLD,
} from './useColumnSelectOptionsCollector';
import { collectSelectOptions } from '../logic/selectOptions';
import type { GridColumn, GridSelectFilterOption } from '../model/gridTypes';

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

// 型に正直な最小カラム(key / width は必須)。既定は set フィルター。
const makeColumn = (
  key: string,
  overrides: Partial<GridColumn<unknown>> = {},
): GridColumn<unknown> => ({
  key,
  width: 100,
  filterType: 'set',
  ...overrides,
});

type CollectorArgs = Parameters<typeof useColumnSelectOptionsCollector<unknown>>[0];

const THRESHOLD = ASYNC_SELECT_COLLECT_ROW_THRESHOLD;
const ASYNC_ROWS = THRESHOLD + 1;

// 溜まった yield をすべて解決し、後続の同期 run と setState を act 内で流します。
const flushYield = async (): Promise<void> => {
  await act(async () => {
    const resolvers = pendingYields.splice(0);
    resolvers.forEach((resolve) => resolve());
    await Promise.resolve();
  });
};

describe('useColumnSelectOptionsCollector - 同期経路(従来挙動・チラつきなし)', () => {
  it('select / set 以外は idle を返す', () => {
    const { result } = renderHook(() =>
      useColumnSelectOptionsCollector({
        column: makeColumn('a', { filterType: 'text' }),
        rowCount: 10,
        getRawValueAt: (index) => index,
      }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.options).toEqual([]);
    expect(result.current.progress).toBe(0);
  });

  it('column=null は idle を返す', () => {
    const { result } = renderHook(() =>
      useColumnSelectOptionsCollector({
        column: null,
        rowCount: 10,
        getRawValueAt: (index) => index,
      }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('閾値以下(<=50k)は同期で即 ready・同期参照と等価', () => {
    const getRaw = (index: number): unknown => `v${index % 6}`;
    const { result } = renderHook(() =>
      useColumnSelectOptionsCollector({
        column: makeColumn('a'),
        rowCount: THRESHOLD, // 50,000 は threshold 超えではない(> 判定)ので同期経路
        getRawValueAt: getRaw,
      }),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.progress).toBe(1);
    expect(result.current.options).toEqual(collectSelectOptions(THRESHOLD, getRaw));
    expect(pendingYields.length).toBe(0); // 非同期 run は起動しない
  });

  it('filterOptions 明示時は閾値超でも即 ready(自動収集しない)', () => {
    const explicit: GridSelectFilterOption[] = [
      { label: 'Beta', value: 'b' },
      { label: 'Alpha', value: 'a' },
    ];
    const { result } = renderHook(() =>
      useColumnSelectOptionsCollector({
        column: makeColumn('a', { filterOptions: explicit }),
        rowCount: ASYNC_ROWS, // 閾値超だが explicit 指定が優先
        getRawValueAt: () => 'unused',
      }),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.options).toEqual(explicit); // 指定順を保持(ソートしない)
    expect(result.current.allValues).toEqual(new Set(['b', 'a']));
    expect(pendingYields.length).toBe(0);
  });
});

describe('useColumnSelectOptionsCollector - 非同期経路(大規模・時間分割)', () => {
  it('idle->collecting(進捗単調増)->ready で同期参照とバイト等価', async () => {
    const getRaw = (index: number): unknown => index % 7;

    const { result } = renderHook(() =>
      useColumnSelectOptionsCollector({
        column: makeColumn('a'),
        rowCount: ASYNC_ROWS,
        getRawValueAt: getRaw,
      }),
    );

    // 初期レンダーは収集中(universe 未確定 = popover ゲートに使う)。
    expect(result.current.status).toBe('collecting');
    expect(result.current.progress).toBe(0);
    expect(result.current.options).toEqual([]);

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
    // collecting(0<p<1)を最低 1 回観測している。
    expect(progresses.some((p) => p > 0 && p < 1)).toBe(true);
    expect(result.current.progress).toBe(1);

    // 結果は同期一括収集とバイト等価(刻み方非依存)。
    const reference = collectSelectOptions(ASYNC_ROWS, getRaw);
    expect(result.current.options).toEqual(reference);
    expect(result.current.allValues).toEqual(
      new Set(reference.map((option) => option.value)),
    );
  });
});

describe('useColumnSelectOptionsCollector - 中断 / stale 排除', () => {
  it('収集途中で列を切替えると in-flight run は中断され、最終結果は新列のみ', async () => {
    const getRawA = (index: number): unknown => `A${index % 5}`;
    const getRawB = (index: number): unknown => `B${index % 3}`;

    const { result, rerender } = renderHook(
      (props: CollectorArgs) => useColumnSelectOptionsCollector(props),
      {
        initialProps: {
          column: makeColumn('a'),
          rowCount: ASYNC_ROWS,
          getRawValueAt: getRawA,
        },
      },
    );

    // A を 1 チャンクだけ進める(まだ ready ではない)。
    await flushYield();
    expect(result.current.status).toBe('collecting');

    // 列 B へ切替(getRawValueAt identity 変化で A の effect が cleanup→中断)。
    rerender({ column: makeColumn('b'), rowCount: ASYNC_ROWS, getRawValueAt: getRawB });
    // 切替直後は key 不一致で collecting(A の候補は出さない)。
    expect(result.current.status).toBe('collecting');

    let guard = 0;
    while (result.current.status !== 'ready' && guard < 100) {
      await flushYield();
      guard += 1;
    }

    // 最終結果は B のみ(中断された A の混入なし)。
    expect(result.current.options).toEqual(collectSelectOptions(ASYNC_ROWS, getRawB));
    expect(result.current.options.some((option) => option.value.startsWith('A'))).toBe(
      false,
    );
  });

  it('前列が ready 到達後に切替えても、新列の収集中は前列の候補を表面化しない(stale 排除)', async () => {
    const getRawA = (index: number): unknown => `A${index % 4}`;
    const getRawB = (index: number): unknown => `B${index % 6}`;

    const { result, rerender } = renderHook(
      (props: CollectorArgs) => useColumnSelectOptionsCollector(props),
      {
        initialProps: {
          column: makeColumn('a'),
          rowCount: ASYNC_ROWS,
          getRawValueAt: getRawA,
        },
      },
    );

    // A を ready まで流し切る。
    let guard = 0;
    while (result.current.status !== 'ready' && guard < 100) {
      await flushYield();
      guard += 1;
    }
    expect(result.current.options).toEqual(collectSelectOptions(ASYNC_ROWS, getRawA));

    // B へ切替えた直後のレンダーで、A の ready 候補が一瞬でも見えないこと(key 照合で stale 排除)。
    rerender({ column: makeColumn('b'), rowCount: ASYNC_ROWS, getRawValueAt: getRawB });
    expect(result.current.status).toBe('collecting');
    expect(result.current.options).toEqual([]);

    // B を流し切ると B の候補に確定。
    guard = 0;
    while (result.current.status !== 'ready' && guard < 100) {
      await flushYield();
      guard += 1;
    }
    expect(result.current.options).toEqual(collectSelectOptions(ASYNC_ROWS, getRawB));
  });

  it('母集合(rowCount)変化で再収集し、結果は新しい rowCount を反映する', async () => {
    const getRaw = (index: number): unknown => index % 9;

    const { result, rerender } = renderHook(
      (props: CollectorArgs) => useColumnSelectOptionsCollector(props),
      {
        initialProps: {
          column: makeColumn('a'),
          rowCount: ASYNC_ROWS,
          getRawValueAt: getRaw,
        },
      },
    );

    await flushYield();
    expect(result.current.status).toBe('collecting');

    // rowCount を変更(同 getRawValueAt)。effect 再実行で旧 run は中断、新 run が起動。
    const nextRowCount = ASYNC_ROWS + 3;
    rerender({ column: makeColumn('a'), rowCount: nextRowCount, getRawValueAt: getRaw });
    // rowCount key 不一致で collecting に戻る。
    expect(result.current.status).toBe('collecting');

    let guard = 0;
    while (result.current.status !== 'ready' && guard < 100) {
      await flushYield();
      guard += 1;
    }
    expect(result.current.options).toEqual(collectSelectOptions(nextRowCount, getRaw));
  });
});

describe('useColumnSelectOptionsCollector - unmount', () => {
  it('収集途中の unmount 後に残 yield を解決しても例外/警告なく no-op', async () => {
    const getRaw = (index: number): unknown => index % 4;
    const { result, unmount } = renderHook(() =>
      useColumnSelectOptionsCollector({
        column: makeColumn('a'),
        rowCount: ASYNC_ROWS,
        getRawValueAt: getRaw,
      }),
    );
    await flushYield();
    expect(result.current.status).toBe('collecting');

    unmount();
    // unmount 後の残 yield 解決は cancelled により setState せず、例外も投げない。
    await expect(flushYield()).resolves.toBeUndefined();
  });
});