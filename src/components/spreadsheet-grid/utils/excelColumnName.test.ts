// B: toExcelColumnName の境界 / 全域等価性テスト(純関数・node)。
//   本番コードは無改修。0-based 列 index → Excel 列名(A, B, ... Z, AA, ...)の
//   bijective base-26 変換が、独立した参照実装と全域(0..2000)で一致することを固定します。
import { describe, it, expect } from 'vitest';
import { toExcelColumnName } from './excelColumnName';

// 参照実装(被テストと独立した bijective base-26)。負値は '' を返します。
const referenceExcelColumnName = (index: number): string => {
  if (index < 0) {
    return '';
  }
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
};

describe('toExcelColumnName (boundaries)', () => {
  it('returns empty string for negative indices', () => {
    expect(toExcelColumnName(-1)).toBe('');
    expect(toExcelColumnName(-26)).toBe('');
    expect(toExcelColumnName(-1000)).toBe('');
  });

  it('maps single-letter range A..Z', () => {
    expect(toExcelColumnName(0)).toBe('A');
    expect(toExcelColumnName(1)).toBe('B');
    expect(toExcelColumnName(25)).toBe('Z');
  });

  it('maps the single→double letter boundary', () => {
    expect(toExcelColumnName(26)).toBe('AA');
    expect(toExcelColumnName(27)).toBe('AB');
    expect(toExcelColumnName(51)).toBe('AZ');
    expect(toExcelColumnName(52)).toBe('BA');
  });

  it('maps the double→triple letter boundary', () => {
    expect(toExcelColumnName(701)).toBe('ZZ');
    expect(toExcelColumnName(702)).toBe('AAA');
    expect(toExcelColumnName(703)).toBe('AAB');
  });
});

describe('toExcelColumnName (equivalence with reference over a full sweep)', () => {
  it('matches the reference implementation for indices 0..2000', () => {
    for (let i = 0; i <= 2000; i += 1) {
      expect(toExcelColumnName(i)).toBe(referenceExcelColumnName(i));
    }
  });

  it('produces only uppercase A..Z letters for non-negative indices', () => {
    for (let i = 0; i <= 2000; i += 1) {
      expect(toExcelColumnName(i)).toMatch(/^[A-Z]+$/);
    }
  });
});