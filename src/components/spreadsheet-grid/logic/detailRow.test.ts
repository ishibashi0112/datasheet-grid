// detail batch 3: rowKey → view index 解決と選択帯の分割の契約テスト。
import { describe, it, expect } from 'vitest';
import type { RowModel } from '../model/gridTypes';
import {
  createDetailIndexCache,
  findDetailRowIndex,
  resolveDetailRowExtras,
  seedDetailIndexCache,
  splitRowBandByDetail,
} from './detailRow';
import { createDetailRowMetrics, createUniformRowMetrics } from './verticalGeometry';

type Row = { id: string; ok?: boolean };

// order(view 順の source index)から clientSide 相当の RowModel を作ります。
const makeModel = (rows: Row[], order: number[]): RowModel<Row> => ({
  getRowCount: () => order.length,
  getRow: (i) => rows[order[i]],
  getSourceIndex: (i) => order[i],
  getRowKey: (i) => rows[order[i]]?.id,
});

describe('resolveDetailRowExtras', () => {
  const rows: Row[] = [
    { id: 'a' },
    { id: 'b', ok: false },
    { id: 'c' },
    { id: 'd' },
  ];

  it('returns [] when nothing is expanded', () => {
    const cache = createDetailIndexCache();
    expect(
      resolveDetailRowExtras({
        expandedKeys: new Set(),
        rowModel: makeModel(rows, [0, 1, 2, 3]),
        height: 200,
        cache,
        allowScan: true,
      }),
    ).toEqual([]);
  });

  it('resolves keys by scanning (clientSide) and returns extras sorted by view index', () => {
    const cache = createDetailIndexCache();
    const model = makeModel(rows, [3, 2, 1, 0]);
    const extras = resolveDetailRowExtras({
      expandedKeys: new Set(['a', 'd']),
      rowModel: model,
      height: 150,
      cache,
      allowScan: true,
    });
    expect(extras).toEqual([
      { index: 0, height: 150 },
      { index: 3, height: 150 },
    ]);
    expect(cache.indexByKey.get('a')).toBe(3);
    expect(cache.indexByKey.get('d')).toBe(0);
  });

  it('revalidates the cache when the order changes (sort / filter)', () => {
    const cache = createDetailIndexCache();
    const keys = new Set(['c']);
    resolveDetailRowExtras({
      expandedKeys: keys,
      rowModel: makeModel(rows, [0, 1, 2, 3]),
      height: 100,
      cache,
      allowScan: true,
    });
    expect(cache.indexByKey.get('c')).toBe(2);
    // ソートで c が先頭へ。キャッシュ index(2)には別行が来るので再走査で 0 に更新される。
    const extras = resolveDetailRowExtras({
      expandedKeys: keys,
      rowModel: makeModel(rows, [2, 0, 1, 3]),
      height: 100,
      cache,
      allowScan: true,
    });
    expect(extras).toEqual([{ index: 0, height: 100 }]);
    expect(cache.indexByKey.get('c')).toBe(0);
  });

  it('drops keys that are filtered out and remembers them as unresolved for the same model', () => {
    const cache = createDetailIndexCache();
    const model = makeModel(rows, [0, 1]);
    const extras = resolveDetailRowExtras({
      expandedKeys: new Set(['d', 'a']),
      rowModel: model,
      height: 100,
      cache,
      allowScan: true,
    });
    expect(extras).toEqual([{ index: 0, height: 100 }]);
    expect(cache.unresolvedFor).toBe(model);
    expect(cache.unresolved.has('d')).toBe(true);
    // 同じ model では unresolved のまま(走査しない)。別 model なら再走査して見つかる。
    const again = resolveDetailRowExtras({
      expandedKeys: new Set(['d']),
      rowModel: model,
      height: 100,
      cache,
      allowScan: true,
    });
    expect(again).toEqual([]);
    const found = resolveDetailRowExtras({
      expandedKeys: new Set(['d']),
      rowModel: makeModel(rows, [3]),
      height: 100,
      cache,
      allowScan: true,
    });
    expect(found).toEqual([{ index: 0, height: 100 }]);
  });

  it('applies isExpandable and skips rows the model cannot return (group / unloaded)', () => {
    const cache = createDetailIndexCache();
    const model: RowModel<Row> = {
      ...makeModel(rows, [0, 1, 2, 3]),
      // 行 2 を「未ロード」に見せる(getRowKey は index を返す serverSide 契約)。
      getRow: (i) => (i === 2 ? (undefined as unknown as Row) : rows[i]),
      getRowKey: (i) => (i === 2 ? i : rows[i].id),
    };
    seedDetailIndexCache(cache, 'c', 2);
    const extras = resolveDetailRowExtras({
      expandedKeys: new Set(['a', 'b', 'c']),
      rowModel: model,
      height: 100,
      isExpandable: (row) => row.ok !== false,
      cache,
      allowScan: true,
    });
    // b は isExpandable=false、c は未ロード(キー不一致で走査しても見つからない)。
    expect(extras).toEqual([{ index: 0, height: 100 }]);
  });

  it('does not scan when allowScan is false (serverSide) but honours a seeded cache', () => {
    const cache = createDetailIndexCache();
    const model = makeModel(rows, [0, 1, 2, 3]);
    expect(
      resolveDetailRowExtras({
        expandedKeys: new Set(['c']),
        rowModel: model,
        height: 100,
        cache,
        allowScan: false,
      }),
    ).toEqual([]);
    seedDetailIndexCache(cache, 'c', 2);
    expect(
      resolveDetailRowExtras({
        expandedKeys: new Set(['c']),
        rowModel: model,
        height: 100,
        cache,
        allowScan: false,
      }),
    ).toEqual([{ index: 2, height: 100 }]);
  });
});

describe('findDetailRowIndex', () => {
  const rows: Row[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('scans when allowed and seeds the cache; honours a valid cache without scanning', () => {
    const cache = createDetailIndexCache();
    const model = makeModel(rows, [2, 0, 1]);
    expect(findDetailRowIndex(model, 'b', cache, true)).toBe(2);
    expect(cache.indexByKey.get('b')).toBe(2);
    // allowScan=false でもキャッシュが有効なら引けます。
    expect(findDetailRowIndex(model, 'b', cache, false)).toBe(2);
    // キャッシュが外れた(別 order)ときは allowScan=false なら -1。
    expect(findDetailRowIndex(makeModel(rows, [1, 2, 0]), 'b', cache, false)).toBe(-1);
    expect(findDetailRowIndex(model, 'zzz', cache, true)).toBe(-1);
  });
});

describe('splitRowBandByDetail', () => {
  const rowHeight = 30;
  const base = createUniformRowMetrics(20, rowHeight);

  it('returns the single band unchanged when no expanded row is inside the range', () => {
    const extras = [{ index: 15, height: 200 }];
    const metrics = createDetailRowMetrics(base, extras);
    expect(splitRowBandByDetail(2, 5, metrics, extras)).toEqual([
      { top: 2 * rowHeight, height: 4 * rowHeight },
    ]);
    expect(splitRowBandByDetail(0, 19, base, [])).toEqual([
      { top: 0, height: 20 * rowHeight },
    ]);
  });

  it('splits around detail bands inside the range and skips their heights', () => {
    const extras = [
      { index: 3, height: 200 },
      { index: 6, height: 100 },
    ];
    const metrics = createDetailRowMetrics(base, extras);
    expect(splitRowBandByDetail(1, 8, metrics, extras)).toEqual([
      // 行 1..3 のセル行まで。
      { top: 1 * rowHeight, height: 3 * rowHeight },
      // 行 4..6 のセル行まで(行 3 の detail 200 を飛ばす)。
      { top: 4 * rowHeight + 200, height: 3 * rowHeight },
      // 行 7..8(行 6 の detail 100 も飛ばす)。
      { top: 7 * rowHeight + 300, height: 2 * rowHeight },
    ]);
  });

  it('omits the trailing segment when the last row of the range is expanded', () => {
    const extras = [{ index: 5, height: 120 }];
    const metrics = createDetailRowMetrics(base, extras);
    expect(splitRowBandByDetail(5, 5, metrics, extras)).toEqual([
      { top: 5 * rowHeight, height: rowHeight },
    ]);
  });
});