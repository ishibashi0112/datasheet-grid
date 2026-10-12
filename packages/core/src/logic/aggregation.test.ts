// grouping ①: 組み込み集計(アキュムレータ生成 → 逐次加算 → 確定)の仕様テストです。
//   数値の扱いは「値駆動」(Number() 変換で有限になる値のみ対象)で、空値
//   (null / undefined / '')は Number() で 0 に化けるため明示的に対象外、が要点です。
//   audit L-10 以降は数値(number / bigint)と数値の文字列だけが対象です。
import { describe, it, expect } from 'vitest';
import {
  accumulateBuiltinAgg,
  createBuiltinAggAccumulator,
  finalizeBuiltinAgg,
  isBuiltinAggFuncName,
  toAggregatableNumber,
  type BuiltinAggAccumulator,
} from './aggregation';

const accumulateAll = (values: unknown[]): BuiltinAggAccumulator => {
  const accumulator = createBuiltinAggAccumulator();
  for (const value of values) {
    accumulateBuiltinAgg(accumulator, value);
  }
  return accumulator;
};

describe('isBuiltinAggFuncName', () => {
  it('組み込み名のみ true になる', () => {
    expect(isBuiltinAggFuncName('sum')).toBe(true);
    expect(isBuiltinAggFuncName('min')).toBe(true);
    expect(isBuiltinAggFuncName('max')).toBe(true);
    expect(isBuiltinAggFuncName('avg')).toBe(true);
    expect(isBuiltinAggFuncName('count')).toBe(true);
    expect(isBuiltinAggFuncName('median')).toBe(false);
    expect(isBuiltinAggFuncName(undefined)).toBe(false);
    expect(isBuiltinAggFuncName(() => 0)).toBe(false);
  });
});

describe('組み込み集計', () => {
  it('数値のみ: sum / avg / min / max / count が一致する', () => {
    const accumulator = accumulateAll([10, 20, 30]);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBe(60);
    expect(finalizeBuiltinAgg('avg', accumulator)).toBe(20);
    expect(finalizeBuiltinAgg('min', accumulator)).toBe(10);
    expect(finalizeBuiltinAgg('max', accumulator)).toBe(30);
    expect(finalizeBuiltinAgg('count', accumulator)).toBe(3);
  });

  it('数値文字列は Number() 変換で集計対象になる(ソートと同じ値駆動)', () => {
    const accumulator = accumulateAll(['10', 5, '2.5']);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBe(17.5);
    expect(finalizeBuiltinAgg('min', accumulator)).toBe(2.5);
    expect(finalizeBuiltinAgg('max', accumulator)).toBe(10);
  });

  it('空値(null / undefined / 空文字)は数値集計から除外され 0 に化けない', () => {
    const accumulator = accumulateAll([null, undefined, '', 10]);
    // Number(null) / Number('') は 0 だが、集計対象は 10 の 1 件のみ。
    expect(finalizeBuiltinAgg('sum', accumulator)).toBe(10);
    expect(finalizeBuiltinAgg('avg', accumulator)).toBe(10);
    expect(finalizeBuiltinAgg('min', accumulator)).toBe(10);
    // count は値の有無に依存しない leaf 行数。
    expect(finalizeBuiltinAgg('count', accumulator)).toBe(4);
  });

  it('非数値(NaN へ落ちる文字列など)は数値集計から除外される', () => {
    const accumulator = accumulateAll(['abc', 3, Infinity, 7]);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBe(10);
    expect(finalizeBuiltinAgg('count', accumulator)).toBe(4);
  });

  it('数値対象 0 件のとき sum / avg / min / max は undefined(空セル)、count は行数', () => {
    const accumulator = accumulateAll(['abc', null, '']);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBeUndefined();
    expect(finalizeBuiltinAgg('avg', accumulator)).toBeUndefined();
    expect(finalizeBuiltinAgg('min', accumulator)).toBeUndefined();
    expect(finalizeBuiltinAgg('max', accumulator)).toBeUndefined();
    expect(finalizeBuiltinAgg('count', accumulator)).toBe(3);
  });

  it('負値と 0 を含む min / max / sum が正しい', () => {
    const accumulator = accumulateAll([-5, 0, 3]);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBe(-2);
    expect(finalizeBuiltinAgg('min', accumulator)).toBe(-5);
    expect(finalizeBuiltinAgg('max', accumulator)).toBe(3);
  });
});

// 追加(audit L-10): 数えるのは数値と数値の文字列だけ。
describe('集計対象の数値判定(audit L-10)', () => {
  it('空白だけの文字列は 0 に化けず数えない', () => {
    const accumulator = accumulateAll([10, ' ', 20, '\t']);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBe(30);
    expect(finalizeBuiltinAgg('avg', accumulator)).toBe(15);
    expect(finalizeBuiltinAgg('min', accumulator)).toBe(10);
    expect(finalizeBuiltinAgg('count', accumulator)).toBe(4);
  });

  it('boolean / Date / 配列 / オブジェクトは数えない', () => {
    const accumulator = accumulateAll([true, false, new Date(0), [7], { valueOf: () => 3 }]);
    expect(accumulator.numericCount).toBe(0);
    expect(finalizeBuiltinAgg('sum', accumulator)).toBeUndefined();
    expect(finalizeBuiltinAgg('count', accumulator)).toBe(5);
  });

  it('数値の文字列(前後の空白・指数表記を含む)と bigint は数える', () => {
    expect(toAggregatableNumber(' 12 ')).toBe(12);
    expect(toAggregatableNumber('1e3')).toBe(1000);
    expect(toAggregatableNumber('-0.5')).toBe(-0.5);
    expect(toAggregatableNumber(5n)).toBe(5);
    expect(toAggregatableNumber(0)).toBe(0);
  });

  it('NaN / Infinity / 数値でない文字列は数えない', () => {
    expect(toAggregatableNumber(Number.NaN)).toBeUndefined();
    expect(toAggregatableNumber(Infinity)).toBeUndefined();
    expect(toAggregatableNumber('abc')).toBeUndefined();
    expect(toAggregatableNumber('')).toBeUndefined();
    expect(toAggregatableNumber(null)).toBeUndefined();
    expect(toAggregatableNumber(undefined)).toBeUndefined();
  });
});