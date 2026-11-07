// detail batch 3: rowKey → view index 解決と選択帯の分割の契約テスト。
import { describe, it, expect } from 'vitest';
import type { RowModel } from '../model/gridTypes.unbound';
import {
  createDetailIndexCache,
  createDetailKeysPruner,
  findDetailRowIndex,
  findViewRowIndexByKey,
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

// 追加(dogfood DU-03): 命令的 API の getViewRowIndex の本体です。
describe('findViewRowIndexByKey', () => {
  it('走査して見つけた位置を覚え、並びが変わったら覚えた位置を確かめ直す', () => {
    const rows: Row[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const cache = new Map<string | number, number>();
    expect(findViewRowIndexByKey(makeModel(rows, [2, 0, 1]), 'b', cache)).toBe(2);
    expect(cache.get('b')).toBe(2);
    expect(findViewRowIndexByKey(makeModel(rows, [1, 2, 0]), 'b', cache)).toBe(0);
    expect(findViewRowIndexByKey(makeModel(rows, [0, 2]), 'b', cache)).toBe(-1);
  });

  it('行が取れない位置(SSRM の未ロード行 = 行キーの代わりに位置を返す)には当てない', () => {
    // SSRM の未ロード行は getRowKey が view index を返す。数値の行キー 1 が未ロードの位置 1 に当たってはいけない。
    const loaded = new Map<number, { id: number }>([[3, { id: 1 }]]);
    const model: RowModel<{ id: number }> = {
      getRowCount: () => 5,
      getRow: (i) => loaded.get(i) as { id: number },
      getSourceIndex: (i) => i,
      getRowKey: (i) => loaded.get(i)?.id ?? i,
    };
    expect(findViewRowIndexByKey(model, 1, new Map())).toBe(3);
    expect(findViewRowIndexByKey(model, 2, new Map())).toBe(-1);
  });
});

// 追加(段階 2 DF-25): 展開中の行が rows から消えたら、そのキーを外します。
describe('createDetailKeysPruner', () => {
  const keyOf = (row: Row) => row.id;
  const run = () => {
    const pruner = createDetailKeysPruner<Row>();
    const calls: string[][] = [];
    let keys: ReadonlySet<string> = new Set();
    const update = (rows: Row[], enabled = true) =>
      pruner.update({
        enabled,
        rows,
        expandedKeys: keys,
        keyOf,
        setExpandedKeys: (next) => {
          keys = next as ReadonlySet<string>;
          calls.push(Array.from(next as ReadonlySet<string>));
        },
      });
    return { update, calls, setKeys: (next: string[]) => (keys = new Set(next)), getKeys: () => Array.from(keys) };
  };
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('前の rows にあって今の rows に無いキーだけを外す(展開した直後の削除も)', () => {
    const t = run();
    t.update([a, b, c]);
    t.setKeys(['b', 'c']);
    t.update([a, b, c]);
    expect(t.calls).toEqual([]);
    t.update([a, c]);
    expect(t.calls).toEqual([['c']]);
    expect(t.getKeys()).toEqual(['c']);
  });

  it('位置が変わっても(並べ替え / 上の行の削除)残っている行のキーは外さない', () => {
    const t = run();
    t.update([a, b, c]);
    t.setKeys(['c']);
    t.update([c, b, a]);
    t.update([b, c]);
    expect(t.calls).toEqual([]);
    t.update([{ id: 'c' }]);
    expect(t.calls).toEqual([]);
  });

  it('rows を読み込む前に戻したキー(一度も rows に無かったキー)は外さない', () => {
    const t = run();
    t.update([]);
    t.setKeys(['b']);
    t.update([]);
    t.update([a]);
    expect(t.calls).toEqual([]);
    t.update([a, b]);
    t.update([a]);
    expect(t.calls).toEqual([[]]);
  });

  it('無効(展開行なし / serverSide)のあいだは何もしない', () => {
    const t = run();
    t.setKeys(['a']);
    t.update([a], false);
    t.update([], false);
    expect(t.calls).toEqual([]);
  });

  it('最初の rows では外さない(マウント時に通知しない)', () => {
    const t = run();
    t.setKeys(['z']);
    t.update([a]);
    expect(t.calls).toEqual([]);
  });
});