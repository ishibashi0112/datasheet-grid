// 追加(本体分解 E-3): auto-height 測定コントローラの単体テストです(実測 → ストア反映 + prefix 再構築 +
//   アンカー補正 + version bump / 同じ deps では再測定しない / 無効化で observer 破棄 / 内容変化で nonce)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoHeightMeasurer, type AutoHeightMeasureArgs } from './autoHeightMeasurer';
import { buildRowHeightStore, createAutoHeightRowMetrics } from '../logic/rowHeightStore';
import type { RowModel } from '../model/gridTypes';

type Row = { id: number };
const rows: Row[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};

// ResizeObserver のスタブ(コールバックを保持し、テストから発火させる)。
let resizeCallback: (() => void) | null = null;
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();

const makeContainer = (heights: number[]) => {
  const container = document.createElement('div');
  let scrollTop = 0;
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  heights.forEach((height, index) => {
    const row = document.createElement('div');
    row.dataset.rowIndex = String(index);
    const cell = document.createElement('div');
    cell.setAttribute('data-autoheight-cell', '');
    cell.getBoundingClientRect = () => ({ height }) as DOMRect;
    row.appendChild(cell);
    container.appendChild(row);
  });
  return container;
};

beforeEach(() => {
  resizeCallback = null;
  observe.mockClear();
  unobserve.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAutoHeightMeasurer', () => {
  it('実測でストアを更新し prefix を再構築、アンカー補正で scrollTop をずらし、version を bump する', () => {
    const measurer = createAutoHeightMeasurer<Row>();
    const listener = vi.fn();
    measurer.subscribe(listener);
    const store = buildRowHeightStore(rows.length, 20, rowModel.getRowKey, measurer.measuredHeights);
    const rowMetrics = createAutoHeightRowMetrics(store);
    const container = makeContainer([50, 20, 30]);
    // 行 1 の途中(scrollTop=25 = 行 1 top 20 + offset 5)を anchor にする。
    container.scrollTop = 25;
    const args: AutoHeightMeasureArgs<Row> = {
      scrollContainerRef: { current: container },
      autoHeightActive: true,
      rowHeightStore: store,
      rowMetrics,
      rowModel,
      virtualRows: [],
      viewportHeight: 100,
      version: 0,
      nonce: 0,
    };
    measurer.update(args);
    expect(measurer.measuredHeights.get(1)).toBe(50);
    expect(measurer.measuredHeights.get(3)).toBe(30);
    // prefix: [0, 50, 70, 100]。anchor 行 1 の top は 20 → 50 なので scrollTop は 25 → 55。
    expect(Array.from(store.prefix.slice(0, 4))).toEqual([0, 50, 70, 100]);
    expect(container.scrollTop).toBe(55);
    expect(measurer.getSnapshot()).toEqual({ version: 1, nonce: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(3);

    // 同じ deps では再測定しない(version bump なし)。
    measurer.update(args);
    expect(measurer.getSnapshot().version).toBe(1);
    // version が変わって再測定しても高さが収束していれば bump しない。
    measurer.update({ ...args, version: 1 });
    expect(measurer.getSnapshot().version).toBe(1);

    // 内容変化(ResizeObserver)で nonce が進む。
    resizeCallback?.();
    expect(measurer.getSnapshot()).toEqual({ version: 1, nonce: 1 });
  });

  it('無効化すると observer を破棄し、dispose でも破棄する', () => {
    const measurer = createAutoHeightMeasurer<Row>();
    const store = buildRowHeightStore(rows.length, 20, rowModel.getRowKey, measurer.measuredHeights);
    const args: AutoHeightMeasureArgs<Row> = {
      scrollContainerRef: { current: makeContainer([20, 20, 20]) },
      autoHeightActive: true,
      rowHeightStore: store,
      rowMetrics: createAutoHeightRowMetrics(store),
      rowModel,
      virtualRows: [],
      viewportHeight: 100,
      version: 0,
      nonce: 0,
    };
    measurer.update(args);
    expect(observe).toHaveBeenCalledTimes(3);
    measurer.update({ ...args, autoHeightActive: false, rowHeightStore: null });
    expect(disconnect).toHaveBeenCalledTimes(1);
    measurer.update(args);
    measurer.dispose();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});