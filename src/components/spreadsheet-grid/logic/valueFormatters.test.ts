import { describe, it, expect } from 'vitest';

import { numberFormatter, type NumberFormatterOptions } from './valueFormatters';
import type { GridColumn } from '../model/gridTypes';

// テスト専用のダミー row / column(numberFormatter は value のみ参照します)。
type Row = Record<string, unknown>;
const col = {} as GridColumn<Row>;
const run = (value: unknown, options?: NumberFormatterOptions): string =>
  numberFormatter<Row>(options)({ value, row: {}, column: col });

// 区切り文字を環境非依存にするため locale を固定します。
const enUS: NumberFormatterOptions = { locale: 'en-US' };

describe('numberFormatter', () => {
  it('整数を 3 桁区切りで整形する', () => {
    expect(run(1234567, enUS)).toBe('1,234,567');
  });

  it('小数は元の精度を保持する(勝手に丸めない)', () => {
    expect(run(1234.5, enUS)).toBe('1,234.5');
    expect(run(1234.567, enUS)).toBe('1,234.567');
  });

  it('0 と負数を整形する', () => {
    expect(run(0, enUS)).toBe('0');
    expect(run(-1234567.89, enUS)).toBe('-1,234,567.89');
  });

  it('null / undefined / 空文字は emptyText(既定 "")', () => {
    expect(run(null, enUS)).toBe('');
    expect(run(undefined, enUS)).toBe('');
    expect(run('', enUS)).toBe('');
  });

  it('emptyText を指定できる', () => {
    expect(run(null, { ...enUS, emptyText: '-' })).toBe('-');
    // 値があるときは emptyText を使わない。
    expect(run(0, { ...enUS, emptyText: '-' })).toBe('0');
  });

  it('数値化できない値は原値の文字列をそのまま返す', () => {
    expect(run('abc', enUS)).toBe('abc');
  });

  it('文字列の数値を取り込む(Number 化。末尾0は失われる)', () => {
    expect(run('1234.50', enUS)).toBe('1,234.5');
  });

  it('useGrouping:false で区切りを無効化する', () => {
    expect(run(1234567, { ...enUS, useGrouping: false })).toBe('1234567');
  });

  it('maximumFractionDigits で固定桁に丸める', () => {
    expect(run(1234.5678, { ...enUS, maximumFractionDigits: 2 })).toBe('1,234.57');
  });

  it('minimumFractionDigits で桁を埋める', () => {
    expect(run(5, { ...enUS, minimumFractionDigits: 2 })).toBe('5.00');
  });
});