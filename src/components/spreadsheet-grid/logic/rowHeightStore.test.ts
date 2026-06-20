// C1-1: rowHeightStore の prefix-sum / measured キャッシュ / 前方更新 / 二分探索の検査と、
//   uniform 行高(estimate 一様・measured 空)での createUniformRowMetrics 等価性。
import { describe, it, expect } from 'vitest';
import {
  buildRowHeightStore,
  createAutoHeightRowMetrics,
  rebuildPrefixFrom,
  setMeasuredRowHeight,
} from './rowHeightStore';
import { createUniformRowMetrics } from './verticalGeometry';
import type { GridRowKey } from '../model/gridTypes';

// view index をそのまま rowKey にする getter(rowKey=index)。
const identityKey = (index: number): GridRowKey => index;

describe('buildRowHeightStore (prefix construction)', () => {
  it('builds a monotonic prefix with prefix[0]=0 and prefix[n]=sum(heights)', () => {
    // estimate 一様: prefix[i] = i * estimate。
    const store = buildRowHeightStore(5, 10, identityKey);
    expect(Array.from(store.prefix)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(store.prefix[0]).toBe(0);
    expect(store.prefix[store.rowCount]).toBe(50);
  });

  it('applies the measured cache by rowKey (overrides estimate)', () => {
    // rowKey=1,3 を実測で上書き。view 順は identity。
    const measured = new Map<GridRowKey, number>([
      [1, 30],
      [3, 5],
    ]);
    const store = buildRowHeightStore(5, 10, identityKey, measured);
    // heights = [10, 30, 10, 5, 10] / prefix = 累積。
    expect(Array.from(store.heights)).toEqual([10, 30, 10, 5, 10]);
    expect(Array.from(store.prefix)).toEqual([0, 10, 40, 50, 55, 65]);
  });

  it('reuses measured heights across a view reorder (rowKey stable)', () => {
    const measured = new Map<GridRowKey, number>([
      [100, 50],
      [200, 8],
    ]);
    // view 順 A: [100, 200, 300]
    const orderA = [100, 200, 300];
    const storeA = buildRowHeightStore(3, 10, (i) => orderA[i], measured);
    expect(Array.from(storeA.heights)).toEqual([50, 8, 10]);
    // view 順 B: [300, 100, 200] へ並べ替え。同じ measured で再構築。
    const orderB = [300, 100, 200];
    const storeB = buildRowHeightStore(3, 10, (i) => orderB[i], measured);
    expect(Array.from(storeB.heights)).toEqual([10, 50, 8]);
  });

  it('handles empty store (rowCount=0)', () => {
    const store = buildRowHeightStore(0, 10, identityKey);
    expect(store.rowCount).toBe(0);
    expect(Array.from(store.prefix)).toEqual([0]);
    const metrics = createAutoHeightRowMetrics(store);
    expect(metrics.totalBodyHeight).toBe(0);
    expect(metrics.rowAtContentY(0)).toBe(0);
    expect(metrics.rowAtContentY(100)).toBe(0);
  });
});

describe('setMeasuredRowHeight + rebuildPrefixFrom (measurement flush)', () => {
  it('updates measured + heights and reports change flags', () => {
    const store = buildRowHeightStore(4, 10, identityKey);
    // 同値は変更なし。
    expect(setMeasuredRowHeight(store, 0, 0, 10)).toBe(false);
    // 異なる値は変更あり + measured へ反映。
    expect(setMeasuredRowHeight(store, 2, 2, 40)).toBe(true);
    expect(store.heights[2]).toBe(40);
    expect(store.measured.get(2)).toBe(40);
    // 範囲外は false。
    expect(setMeasuredRowHeight(store, -1, 99, 5)).toBe(false);
    expect(setMeasuredRowHeight(store, 4, 99, 5)).toBe(false);
  });

  it('rebuilds prefix forward from the minimum changed index only', () => {
    const store = buildRowHeightStore(5, 10, identityKey);
    // index 2 を 40 へ。flush 前は prefix は古いまま。
    setMeasuredRowHeight(store, 2, 2, 40);
    // 最小変更 index=2 から前方再構築。
    rebuildPrefixFrom(store, 2);
    // heights = [10,10,40,10,10] / prefix = [0,10,20,60,70,80]。
    expect(Array.from(store.prefix)).toEqual([0, 10, 20, 60, 70, 80]);
    expect(store.prefix[store.rowCount]).toBe(80);
  });

  it('accumulates multiple measured deltas in one flush', () => {
    const store = buildRowHeightStore(5, 10, identityKey);
    setMeasuredRowHeight(store, 1, 1, 25);
    setMeasuredRowHeight(store, 3, 3, 5);
    // 最小変更 index=1 から 1 回だけ再構築。
    rebuildPrefixFrom(store, 1);
    // heights = [10,25,10,5,10] / prefix = [0,10,35,45,50,60]。
    expect(Array.from(store.prefix)).toEqual([0, 10, 35, 45, 50, 60]);
  });
});

describe('createAutoHeightRowMetrics (non-uniform heights)', () => {
  it('resolves rowTop / rowsHeight / totalBodyHeight from prefix', () => {
    const measured = new Map<GridRowKey, number>([
      [0, 20],
      [1, 30],
      [2, 10],
    ]);
    const store = buildRowHeightStore(3, 10, identityKey, measured);
    const metrics = createAutoHeightRowMetrics(store);
    // heights = [20, 30, 10] / prefix = [0, 20, 50, 60]。
    expect(metrics.rowTop(0)).toBe(0);
    expect(metrics.rowTop(1)).toBe(20);
    expect(metrics.rowTop(2)).toBe(50);
    expect(metrics.rowsHeight(0, 0)).toBe(20);
    expect(metrics.rowsHeight(1, 2)).toBe(40);
    expect(metrics.rowsHeight(0, 2)).toBe(60);
    expect(metrics.totalBodyHeight).toBe(60);
  });

  it('binary-searches rowAtContentY across variable heights and edges', () => {
    const measured = new Map<GridRowKey, number>([
      [0, 20],
      [1, 30],
      [2, 10],
    ]);
    const store = buildRowHeightStore(3, 10, identityKey, measured);
    const metrics = createAutoHeightRowMetrics(store);
    // prefix = [0, 20, 50, 60]。区間 [prefix[i], prefix[i+1]) が行 i。
    expect(metrics.rowAtContentY(-5)).toBe(0); // y<0
    expect(metrics.rowAtContentY(0)).toBe(0); // 行 0 の上端
    expect(metrics.rowAtContentY(19)).toBe(0);
    expect(metrics.rowAtContentY(20)).toBe(1); // 境界は次行の上端
    expect(metrics.rowAtContentY(49)).toBe(1);
    expect(metrics.rowAtContentY(50)).toBe(2);
    expect(metrics.rowAtContentY(59)).toBe(2);
    expect(metrics.rowAtContentY(60)).toBe(2); // y>=total は末尾行
    expect(metrics.rowAtContentY(1000)).toBe(2);
  });
});

describe('createAutoHeightRowMetrics (uniform equivalence with createUniformRowMetrics)', () => {
  // estimate 一様・measured 空のとき、auto-height 版 RowMetrics は uniform 版と全 index 一致します
  //   (prefix-sum が uniform 算術の正しい一般化であることの担保)。
  const cases: Array<{ rowCount: number; rowHeight: number }> = [
    { rowCount: 1, rowHeight: 36 },
    { rowCount: 10, rowHeight: 38 },
    { rowCount: 137, rowHeight: 42 },
    { rowCount: 1000, rowHeight: 24 },
  ];

  for (const { rowCount, rowHeight } of cases) {
    it(`matches uniform for rowCount=${rowCount} rowHeight=${rowHeight}`, () => {
      const uniform = createUniformRowMetrics(rowCount, rowHeight);
      const store = buildRowHeightStore(rowCount, rowHeight, identityKey);
      const auto = createAutoHeightRowMetrics(store);

      expect(auto.rowCount).toBe(uniform.rowCount);
      expect(auto.totalBodyHeight).toBe(uniform.totalBodyHeight);

      // rowTop / rowsHeight / rowAtContentY を全 index・代表 y でスイープ照合。
      for (let i = 0; i < rowCount; i += 1) {
        expect(auto.rowTop(i)).toBe(uniform.rowTop(i));
        expect(auto.rowsHeight(i, i)).toBe(uniform.rowsHeight(i, i));
        if (i + 5 < rowCount) {
          expect(auto.rowsHeight(i, i + 5)).toBe(uniform.rowsHeight(i, i + 5));
        }
      }

      // content-y → row(境界・中央・端を含む)。
      const total = rowCount * rowHeight;
      const samples = [
        -10,
        0,
        rowHeight - 1,
        rowHeight,
        Math.floor(total / 2),
        Math.floor(total / 2) + 1,
        total - 1,
        total,
        total + 100,
      ];
      for (const y of samples) {
        expect(auto.rowAtContentY(y)).toBe(uniform.rowAtContentY(y));
      }
    });
  }
});