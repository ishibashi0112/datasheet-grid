// serverSideCache(SSRM スパース LRU キャッシュ)の純ロジックテストです。
//   getRow のオフセット解決 / 部分末端ブロック / LRU evict / touchBlocks の recency 更新 /
//   setBlock 更新の MRU 化 / clear を検査します。これらが「常駐量 O(定数)」の根拠です。
import { describe, it, expect } from 'vitest';
import { createServerSideRowCache } from './serverSideCache';

type Row = { v: number };

// blockIndex のブロックを「先頭 viewIndex から連番 v を振った count 行」で作ります。
const makeBlock = (blockIndex: number, blockSize: number, count: number): Row[] => {
  const base = blockIndex * blockSize;
  const rows: Row[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ v: base + i });
  }
  return rows;
};

describe('createServerSideRowCache', () => {
  it('未ロードは undefined / hasBlock=false', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
    expect(cache.getRow(250)).toBeUndefined();
    expect(cache.hasBlock(2)).toBe(false);
  });

  it('setBlock 後は getRow がブロック内オフセットで引ける', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
    cache.setBlock(2, makeBlock(2, 100, 100));
    expect(cache.hasBlock(2)).toBe(true);
    // viewIndex 250 → block2 の offset 50。
    expect(cache.getRow(250)).toEqual({ v: 250 });
    expect(cache.getRow(200)).toEqual({ v: 200 });
    expect(cache.getRow(299)).toEqual({ v: 299 });
  });

  it('部分末端ブロックの範囲外オフセットは undefined', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
    // block3 に 3 行だけ(300,301,302)。
    cache.setBlock(3, makeBlock(3, 100, 3));
    expect(cache.getRow(302)).toEqual({ v: 302 });
    expect(cache.getRow(303)).toBeUndefined();
    expect(cache.getRow(399)).toBeUndefined();
  });

  it('負の viewIndex は undefined', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
    cache.setBlock(0, makeBlock(0, 100, 100));
    expect(cache.getRow(-1)).toBeUndefined();
  });

  it('maxBlocks 超過で最古ブロックを退避(LRU)', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 2 });
    cache.setBlock(0, makeBlock(0, 100, 100));
    cache.setBlock(1, makeBlock(1, 100, 100));
    cache.setBlock(2, makeBlock(2, 100, 100));
    // 0 が最古 → 退避。1,2 が残る。
    expect(cache.loadedBlockIndexes()).toEqual([1, 2]);
    expect(cache.getRow(50)).toBeUndefined();
    expect(cache.getRow(150)).toEqual({ v: 150 });
  });

  it('touchBlocks が recency を更新し退避先を変える', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 2 });
    cache.setBlock(0, makeBlock(0, 100, 100));
    cache.setBlock(1, makeBlock(1, 100, 100));
    // 0 を MRU 化 → 順序は [1,0]。
    cache.touchBlocks([0]);
    cache.setBlock(2, makeBlock(2, 100, 100));
    // 今度は 1 が最古 → 退避。0,2 が残る。
    expect(cache.loadedBlockIndexes()).toEqual([0, 2]);
    expect(cache.getRow(50)).toEqual({ v: 50 });
    expect(cache.getRow(150)).toBeUndefined();
  });

  it('touchBlocks は未ロードブロックを無視する', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 2 });
    cache.setBlock(0, makeBlock(0, 100, 100));
    // 未ロードの 9 を touch しても順序は不変。
    cache.touchBlocks([9]);
    expect(cache.loadedBlockIndexes()).toEqual([0]);
  });

  it('setBlock の再投入は MRU 化として働く', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 2 });
    cache.setBlock(0, makeBlock(0, 100, 100));
    cache.setBlock(1, makeBlock(1, 100, 100));
    // 0 を再投入 → 末尾へ。順序は [1,0]。
    cache.setBlock(0, makeBlock(0, 100, 100));
    cache.setBlock(2, makeBlock(2, 100, 100));
    // 1 が最古 → 退避。0,2 が残る。
    expect(cache.loadedBlockIndexes()).toEqual([0, 2]);
  });

  it('clear で全ブロックを破棄', () => {
    const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
    cache.setBlock(0, makeBlock(0, 100, 100));
    cache.setBlock(1, makeBlock(1, 100, 100));
    cache.clear();
    expect(cache.loadedBlockIndexes()).toEqual([]);
    expect(cache.getRow(50)).toBeUndefined();
    expect(cache.hasBlock(0)).toBe(false);
  });

  describe('updateRow(SSRM 書き戻し)', () => {
    it('ロード済みブロックの単一行を差し替えて true を返す', () => {
      const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
      cache.setBlock(2, makeBlock(2, 100, 100));
      expect(cache.updateRow(250, { v: 9999 })).toBe(true);
      expect(cache.getRow(250)).toEqual({ v: 9999 });
      // 同一ブロックの他行は不変。
      expect(cache.getRow(249)).toEqual({ v: 249 });
      expect(cache.getRow(251)).toEqual({ v: 251 });
    });

    it('コピーオンライトで差し替える(旧配列参照は不変)', () => {
      const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
      const original = makeBlock(0, 100, 100);
      cache.setBlock(0, original);
      cache.updateRow(10, { v: -1 });
      // setBlock に渡した元配列は書き換えられない(rowModel memo が旧参照を掴んでいても安全)。
      expect(original[10]).toEqual({ v: 10 });
      expect(cache.getRow(10)).toEqual({ v: -1 });
    });

    it('未ロードブロックは false(ブロックを復活させない)', () => {
      const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
      expect(cache.updateRow(250, { v: 1 })).toBe(false);
      expect(cache.hasBlock(2)).toBe(false);
      expect(cache.getRow(250)).toBeUndefined();
    });

    it('部分末端ブロックの範囲外オフセットは false', () => {
      const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
      cache.setBlock(3, makeBlock(3, 100, 3));
      expect(cache.updateRow(302, { v: 1 })).toBe(true);
      expect(cache.updateRow(303, { v: 1 })).toBe(false);
      expect(cache.getRow(303)).toBeUndefined();
    });

    it('負の viewIndex は false', () => {
      const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 4 });
      cache.setBlock(0, makeBlock(0, 100, 100));
      expect(cache.updateRow(-1, { v: 1 })).toBe(false);
    });

    it('recency(LRU 順)を変えない', () => {
      const cache = createServerSideRowCache<Row>({ blockSize: 100, maxBlocks: 2 });
      cache.setBlock(0, makeBlock(0, 100, 100));
      cache.setBlock(1, makeBlock(1, 100, 100));
      // 最古の block0 の行を更新しても順序は [0,1] のまま。
      cache.updateRow(10, { v: -1 });
      expect(cache.loadedBlockIndexes()).toEqual([0, 1]);
      // 新ブロック投入で退避されるのは依然 block0(更新が MRU 化しない)。
      cache.setBlock(2, makeBlock(2, 100, 100));
      expect(cache.loadedBlockIndexes()).toEqual([1, 2]);
    });
  });
});