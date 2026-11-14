// 追加(非依存化 ③-10): selectOptionsCollector のテストです(React 非依存で直接呼ぶ)。
//   hooks/useColumnSelectOptionsCollector.test.ts(既存 8 件 = 同期 / 非同期 / 中断 / stale)と対になり、
//   こちらは同期解決の純関数・キー変更での中断と再開・dispose を固定します。
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
  ASYNC_SELECT_COLLECT_ROW_THRESHOLD,
  createSelectOptionsCollector,
  resolveSyncSelectOptions,
  selectCollectorResult,
} from './selectOptionsCollector';
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
  // 予算 10ms を 3 件で超える時計(6ms 刻み): 1 チャンク = 2 件。
  vi.spyOn(performance, 'now').mockImplementation(() => (tick += 6));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const setColumn: GridColumn<unknown> = { key: 'k', width: 100, filterType: 'set' };

describe('resolveSyncSelectOptions', () => {
  it('非対象列 / null は idle、filterOptions 明示は即 ready、閾値以下は同期収集、閾値超は null', () => {
    expect(resolveSyncSelectOptions(null, 10, () => 'a')?.status).toBe('idle');
    expect(resolveSyncSelectOptions({ key: 'k', width: 1, filterType: 'text' }, 10, () => 'a')?.status).toBe('idle');
    const explicit = resolveSyncSelectOptions(
      { ...setColumn, filterOptions: [{ value: 'x', label: 'X' }] },
      ASYNC_SELECT_COLLECT_ROW_THRESHOLD + 1,
      () => 'a',
    );
    expect(explicit?.status).toBe('ready');
    expect(explicit?.allValues.has('x')).toBe(true);
    const sync = resolveSyncSelectOptions(setColumn, 3, (i) => ['a', 'b', 'a'][i]);
    expect(sync?.status).toBe('ready');
    expect(sync?.options.map((o) => o.value)).toEqual(['a', 'b']);
    expect(resolveSyncSelectOptions(setColumn, ASYNC_SELECT_COLLECT_ROW_THRESHOLD + 1, () => 'a')).toBeNull();
  });
});

describe('createSelectOptionsCollector', () => {
  it('needsAsync のキーで収集を開始し、進捗 → ready を通知する。同じキーの update では再開しない', async () => {
    const collector = createSelectOptionsCollector();
    const getRawValueAt = (i: number) => (i % 2 === 0 ? 'even' : 'odd');
    const listener = vi.fn();
    collector.subscribe(listener);
    collector.update({ needsAsync: true, rowCount: 5, getRawValueAt });
    collector.update({ needsAsync: true, rowCount: 5, getRawValueAt });
    await flushYields();
    let result = selectCollectorResult(collector.getSnapshot(), 5, getRawValueAt);
    expect(result.status).toBe('collecting');
    expect(result.progress).toBeGreaterThan(0);
    await flushYields();
    await flushYields();
    result = selectCollectorResult(collector.getSnapshot(), 5, getRawValueAt);
    expect(result.status).toBe('ready');
    expect(result.options.map((o) => o.value).sort()).toEqual(['even', 'odd']);
    // 別キーからは表面化しない(stale 排除)。
    expect(selectCollectorResult(collector.getSnapshot(), 6, getRawValueAt).status).toBe('collecting');
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('キー変更で in-flight を中断して新キーで再開、needsAsync=false / dispose でも中断する', async () => {
    const collector = createSelectOptionsCollector();
    const first = (i: number) => `f${i}`;
    const second = (i: number) => `s${i}`;
    collector.update({ needsAsync: true, rowCount: 5, getRawValueAt: first });
    collector.update({ needsAsync: true, rowCount: 5, getRawValueAt: second });
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    const snapshot = collector.getSnapshot();
    expect(snapshot.source).toBe(second);
    expect(snapshot.result.status).toBe('ready');
    expect(snapshot.result.options.map((o) => o.value)).toEqual(['s0', 's1', 's2', 's3', 's4']);

    const third = (i: number) => `t${i}`;
    collector.update({ needsAsync: true, rowCount: 5, getRawValueAt: third });
    collector.update({ needsAsync: false, rowCount: 5, getRawValueAt: third });
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    expect(collector.getSnapshot().source).toBe(second);

    collector.update({ needsAsync: true, rowCount: 5, getRawValueAt: third });
    collector.dispose();
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    expect(collector.getSnapshot().source).toBe(second);
  });

  // 追加(audit C-11): StrictMode の擬似アンマウント(dispose)→ 同じ args の update で、中断した収集をやり直す。
  //   走り切った後の dispose → update では収集し直さない。
  it('収集中に dispose で中断しても、同じ args の update で収集し直す', async () => {
    const collector = createSelectOptionsCollector();
    const getRawValueAt = (i: number) => `v${i}`;
    const args = { needsAsync: true, rowCount: 5, getRawValueAt };
    collector.update(args);
    await flushYields();
    collector.dispose();
    collector.update(args);
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    const snapshot = collector.getSnapshot();
    expect(snapshot.result.status).toBe('ready');
    expect(snapshot.result.options.map((o) => o.value)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4']);

    collector.dispose();
    collector.update(args);
    await flushYields();
    expect(collector.getSnapshot()).toBe(snapshot);
    expect(pendingYields).toHaveLength(0);
  });

  // 追加(1.0.1 / 実アプリの総点検 AP-19): 同じ列のまま行だけが変わったら、走っている収集を止めずに最後まで走らせて
  //   候補を出し、それから今の行で集め直す(集め直しの間も前の候補を出したまま)。
  it('同じ列で行だけが変わっても収集を止めず、候補を出したまま集め直す(AP-19)', async () => {
    const collector = createSelectOptionsCollector();
    const first = ['a', 'b', 'a', 'c'];
    const firstAccessor = (index: number) => first[index];
    collector.update({ needsAsync: true, rowCount: first.length, getRawValueAt: firstAccessor, sourceKey: 'k' });
    await flushYields();
    // 走っている間に行が変わった(末尾に 'd')。
    const second = [...first, 'd'];
    const secondAccessor = (index: number) => second[index];
    collector.update({ needsAsync: true, rowCount: second.length, getRawValueAt: secondAccessor, sourceKey: 'k' });
    for (let i = 0; i < 4; i += 1) {
      await flushYields();
    }
    // 最初の収集が最後まで走り、前の行の候補が出る(今の行の accessor でも同じ列なら出す)。
    const shown = selectCollectorResult(collector.getSnapshot(), second.length, secondAccessor, 'k');
    expect(shown.status).toBe('ready');
    expect(shown.options.map((o) => o.value)).toContain('a');
    for (let i = 0; i < 8; i += 1) {
      await flushYields();
      // 集め直しの間も候補を出したまま。
      expect(selectCollectorResult(collector.getSnapshot(), second.length, secondAccessor, 'k').status).toBe('ready');
    }
    expect(selectCollectorResult(collector.getSnapshot(), second.length, secondAccessor, 'k').options.map((o) => o.value)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    // 別の列の結果は出さない。
    expect(selectCollectorResult(collector.getSnapshot(), 1, () => 'x', 'other').status).toBe('collecting');
    collector.dispose();
  });

  // 1.0.1 のレビュー RB-4: 閉じて(収集しなくなって)から行が変わり、同じ列を開き直すと、前のデータの候補が「済み」で出ていた。
  it('閉じてから行が変わって開き直したら、前の候補を出さずに集め直す(RB-4)', async () => {
    const collector = createSelectOptionsCollector();
    const first = ['old-0', 'old-1'];
    const firstAccessor = (index: number) => first[index];
    collector.update({ needsAsync: true, rowCount: first.length, getRawValueAt: firstAccessor, sourceKey: 'v' });
    for (let i = 0; i < 4; i += 1) {
      await flushYields();
    }
    expect(selectCollectorResult(collector.getSnapshot(), first.length, firstAccessor, 'v').status).toBe('ready');
    // 閉じる(列が無い = 同期の経路で idle)。
    collector.update({ needsAsync: false, rowCount: first.length, getRawValueAt: firstAccessor });
    // 同じ行のまま開き直したら、前の候補をそのまま出す(集め直しの間も)。
    expect(selectCollectorResult(collector.getSnapshot(), first.length, firstAccessor, 'v').status).toBe('ready');
    collector.update({ needsAsync: true, rowCount: first.length, getRawValueAt: firstAccessor, sourceKey: 'v' });
    for (let i = 0; i < 4; i += 1) {
      await flushYields();
      expect(selectCollectorResult(collector.getSnapshot(), first.length, firstAccessor, 'v').status).toBe('ready');
    }
    collector.update({ needsAsync: false, rowCount: first.length, getRawValueAt: firstAccessor });
    // 行が変わってから開き直したら、集め直しの間は前の候補を出さない。
    const second = ['new-0', 'new-1', 'new-2'];
    const secondAccessor = (index: number) => second[index];
    collector.update({ needsAsync: true, rowCount: second.length, getRawValueAt: secondAccessor, sourceKey: 'v' });
    expect(selectCollectorResult(collector.getSnapshot(), second.length, secondAccessor, 'v').status).toBe('collecting');
    for (let i = 0; i < 6; i += 1) {
      await flushYields();
    }
    expect(selectCollectorResult(collector.getSnapshot(), second.length, secondAccessor, 'v').options.map((o) => o.value)).toEqual([
      'new-0',
      'new-1',
      'new-2',
    ]);
    collector.dispose();
  });
});