// 追加(本体分解 E-3): auto-height 測定コントローラの単体テストです(実測 → ストア反映 + prefix 再構築 +
//   アンカー補正 + version bump / 同じ deps では再測定しない / 無効化で observer 破棄 / 内容変化で nonce)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoHeightMeasurer, type AutoHeightMeasureArgs } from './autoHeightMeasurer';
import { buildRowHeightStore, createAutoHeightRowMetrics } from '../logic/rowHeightStore';
import { createDetailRowMetrics, createRowHeightOverrideMetrics } from '../logic/verticalGeometry';
import type { RowModel } from '../model/gridTypes.unbound';

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
// 追加(BR-1): rAF のスタブ(nonce は ResizeObserver の次のフレームで進む)。取り消したフレームは空の処理に差し替えます。
let rafQueue: FrameRequestCallback[] = [];
const runFrame = () => {
  const callbacks = rafQueue;
  rafQueue = [];
  for (const callback of callbacks) {
    callback(0);
  }
};

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
  rafQueue = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue[id - 1] = () => {};
  });
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
  // 追加(BR-1 見直し 2026-10-28): 高さ 0(隠れている間)は記録しない(0 を記録すると窓に入る行が増えて描き直しが
  //   止まらなくなる)。0 の行は前の高さのまま、0 でない行だけ反映する。
  it('高さ 0 のセルは記録しない', () => {
    const measurer = createAutoHeightMeasurer<Row>();
    const store = buildRowHeightStore(rows.length, 20, rowModel.getRowKey, measurer.measuredHeights);
    const args: AutoHeightMeasureArgs<Row> = {
      scrollContainerRef: { current: makeContainer([0, 0, 0]) },
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
    expect(measurer.measuredHeights.size).toBe(0);
    expect(Array.from(store.heights)).toEqual([20, 20, 20]);
    expect(measurer.getSnapshot().version).toBe(0);
    measurer.update({ ...args, scrollContainerRef: { current: makeContainer([0, 45, 0]) }, version: 1 });
    expect(Array.from(store.heights)).toEqual([20, 45, 20]);
    expect(measurer.measuredHeights.has(1)).toBe(false);
    expect(measurer.measuredHeights.get(2)).toBe(45);
    measurer.dispose();
  });

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

    // 内容変化(ResizeObserver)で nonce が進む。変更(BR-1): コールバックの中では進めず、次のフレームで 1 回だけ進める。
    resizeCallback?.();
    resizeCallback?.();
    expect(measurer.getSnapshot()).toEqual({ version: 1, nonce: 0 });
    runFrame();
    expect(measurer.getSnapshot()).toEqual({ version: 1, nonce: 1 });
    // dispose は進める前のフレームを取り消す。
    resizeCallback?.();
    measurer.dispose();
    runFrame();
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

  // 追加(audit C-11): StrictMode の擬似アンマウント(dispose)→ 同じ args の update でも observer を作り直す。
  it('dispose 後に同じ args で update すると、測り直して observer を作り直す', () => {
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
    measurer.dispose();
    measurer.update(args);
    expect(observe).toHaveBeenCalledTimes(6);
    resizeCallback?.();
    runFrame();
    expect(measurer.getSnapshot().nonce).toBe(1);
  });

  // 追加(audit B-01): 展開行帯 / ラベル行高の上書きがアンカーより上にあっても、アンカー行の画面位置を保つ。
  describe('装飾済み rowMetrics のアンカー補正(audit B-01)', () => {
    const tenRows: Row[] = Array.from({ length: 10 }, (_, index) => ({ id: index + 1 }));
    const tenModel: RowModel<Row> = {
      getRowCount: () => tenRows.length,
      getRow: (i) => tenRows[i],
      getSourceIndex: (i) => i,
      getRowKey: (i) => tenRows[i]?.id ?? i,
    };
    // 行 7 だけ実測 50(他は推定 30 のまま)。
    const container = () => makeContainer(Array.from({ length: 10 }, (_, index) => (index === 7 ? 50 : 30)));

    it('展開行帯(行 0 の下に 200px)があるとき、アンカー(行 5)より下の行が伸びても scrollTop は変わらない', () => {
      const measurer = createAutoHeightMeasurer<Row>();
      const store = buildRowHeightStore(tenRows.length, 30, tenModel.getRowKey, measurer.measuredHeights);
      const decorated = createDetailRowMetrics(createAutoHeightRowMetrics(store), [{ index: 0, height: 200 }]);
      expect(decorated.rowTop(5)).toBe(350);
      const el = container();
      el.scrollTop = 350;
      measurer.update({
        scrollContainerRef: { current: el },
        autoHeightActive: true,
        rowHeightStore: store,
        rowMetrics: decorated,
        rowModel: tenModel,
        virtualRows: [],
        viewportHeight: 100,
        version: 0,
        nonce: 0,
      });
      expect(el.scrollTop).toBe(350);
    });

    it('アンカーより上の行が伸びたときは、その差分だけ下へずらす(帯の高さは差し引かない)', () => {
      const measurer = createAutoHeightMeasurer<Row>();
      const store = buildRowHeightStore(tenRows.length, 30, tenModel.getRowKey, measurer.measuredHeights);
      const decorated = createDetailRowMetrics(createAutoHeightRowMetrics(store), [{ index: 0, height: 200 }]);
      // 行 8(top = 200 + 8*30 = 440)の 10px 下を anchor に。行 7 が 30 → 50 になるので 20px 下へ。
      const el = container();
      el.scrollTop = 450;
      measurer.update({
        scrollContainerRef: { current: el },
        autoHeightActive: true,
        rowHeightStore: store,
        rowMetrics: decorated,
        rowModel: tenModel,
        virtualRows: [],
        viewportHeight: 100,
        version: 0,
        nonce: 0,
      });
      expect(el.scrollTop).toBe(470);
    });

    it('ラベル行高の上書き(行 0 = 100px)があるときも、アンカー(行 5)の位置を保つ', () => {
      const measurer = createAutoHeightMeasurer<Row>();
      const store = buildRowHeightStore(tenRows.length, 30, tenModel.getRowKey, measurer.measuredHeights);
      const decorated = createRowHeightOverrideMetrics(createAutoHeightRowMetrics(store), [{ index: 0, height: 100 }]);
      expect(decorated.rowTop(5)).toBe(220);
      const el = container();
      el.scrollTop = 220;
      measurer.update({
        scrollContainerRef: { current: el },
        autoHeightActive: true,
        rowHeightStore: store,
        rowMetrics: decorated,
        rowModel: tenModel,
        virtualRows: [],
        viewportHeight: 100,
        version: 0,
        nonce: 0,
      });
      expect(el.scrollTop).toBe(220);
    });
  });
});