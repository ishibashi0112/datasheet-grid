// serverSideBlocks(SSRM ブロック算出)の純ロジックテストです。
//   不変条件「可視レンジ → 交差ブロックのみ・定数サイズ」を境界中心に固定します。
//   end 排他 / start 負クランプ / rowCount 右端クランプ / 空・0 件の各退避を検査します。
import { describe, it, expect } from 'vitest';
import { blockIndexForRow, computeBlockIndexes } from './serverSideBlocks';

describe('blockIndexForRow', () => {
  it('viewIndex を blockSize で割った床を返す', () => {
    expect(blockIndexForRow(0, 100)).toBe(0);
    expect(blockIndexForRow(99, 100)).toBe(0);
    expect(blockIndexForRow(100, 100)).toBe(1);
    expect(blockIndexForRow(250, 100)).toBe(2);
  });
});

describe('computeBlockIndexes', () => {
  it('レンジに交差するブロックを昇順で返す(基本)', () => {
    // [250,460) は block2(200-299) / block3(300-399) / block4(400-499) に交差。
    expect(computeBlockIndexes(250, 460, 100, 1000)).toEqual([2, 3, 4]);
  });

  it('end は排他(境界はまたがない)', () => {
    // [200,300) は block2 のみ。300 は block3 の先頭だが排他なので含めない。
    expect(computeBlockIndexes(200, 300, 100, 1000)).toEqual([2]);
  });

  it('start が負なら 0 へクランプ', () => {
    // start=-50 → 0。[0,150) は block0 / block1。
    expect(computeBlockIndexes(-50, 150, 100, 1000)).toEqual([0, 1]);
  });

  it('end は rowCount で右端クランプ(末端の取りすぎ防止)', () => {
    // rowCount=350 のとき [300,500) は end→350。末端行 349 は block3。
    expect(computeBlockIndexes(300, 500, 100, 350)).toEqual([3]);
  });

  it('単一行レンジは 1 ブロック', () => {
    expect(computeBlockIndexes(99, 100, 100, 1000)).toEqual([0]);
    expect(computeBlockIndexes(100, 101, 100, 1000)).toEqual([1]);
  });

  it('全域レンジは全ブロック', () => {
    expect(computeBlockIndexes(0, 1000, 100, 1000)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('空レンジ(end<=start)は []', () => {
    expect(computeBlockIndexes(300, 300, 100, 1000)).toEqual([]);
    expect(computeBlockIndexes(300, 200, 100, 1000)).toEqual([]);
  });

  it('rowCount<=0 は []', () => {
    expect(computeBlockIndexes(0, 100, 100, 0)).toEqual([]);
  });

  it('blockSize<=0 は []', () => {
    expect(computeBlockIndexes(0, 100, 0, 1000)).toEqual([]);
  });
});