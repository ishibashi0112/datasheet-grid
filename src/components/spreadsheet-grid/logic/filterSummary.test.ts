// 追加(FM-1)の単体テスト: describeColumnFilterValue(列フィルター値 → 人間可読要約)の
//   仕様固定です。
//   - text / date: 「"x" を含む」(trim 後)。select: 「"x" に一致」。number: raw 式そのまま。
//   - set: include 1〜2 件は値列挙(空文字は「(空白)」)/ 3 件以上・0 件は「N 件を選択」/
//     exclude は「N 件を除外」/ mode 省略は include 扱い(後方互換)。
//   - custom: 非空 string は「"x"」(trim)、それ以外は「カスタム条件」。
import { describe, it, expect } from 'vitest';
import { describeColumnFilterValue } from './filterSummary';

describe('describeColumnFilterValue', () => {
  it('text / date は trim して「"x" を含む」', () => {
    expect(describeColumnFilterValue({ kind: 'text', value: ' SUS ' })).toBe(
      '"SUS" を含む',
    );
    expect(
      describeColumnFilterValue({ kind: 'date', value: '2026-07' }),
    ).toBe('"2026-07" を含む');
  });

  it('select は「"x" に一致」(trim しない = 判定側と同じ生値)', () => {
    expect(
      describeColumnFilterValue({ kind: 'select', value: '締結部品' }),
    ).toBe('"締結部品" に一致');
  });

  it('number は raw 式そのまま(解釈可否に依らない)', () => {
    expect(
      describeColumnFilterValue({
        kind: 'number',
        raw: '>= 1000',
        parsed: { mode: 'comparison', operator: '>=', value: 1000 },
      }),
    ).toBe('>= 1000');
    expect(
      describeColumnFilterValue({ kind: 'number', raw: 'abc', parsed: null }),
    ).toBe('abc');
  });

  it('set(include)1〜2 件は値を列挙し、空文字は「(空白)」と表示する', () => {
    expect(
      describeColumnFilterValue({
        kind: 'set',
        mode: 'include',
        values: ['締結部品'],
      }),
    ).toBe('"締結部品"');
    expect(
      describeColumnFilterValue({
        kind: 'set',
        mode: 'include',
        values: ['締結部品', ''],
      }),
    ).toBe('"締結部品", (空白)');
  });

  it('set の mode 省略は include 扱い(後方互換)', () => {
    expect(
      describeColumnFilterValue({ kind: 'set', values: ['A', 'B'] }),
    ).toBe('"A", "B"');
  });

  it('set(include)3 件以上と 0 件は「N 件を選択」', () => {
    expect(
      describeColumnFilterValue({
        kind: 'set',
        mode: 'include',
        values: ['A', 'B', 'C'],
      }),
    ).toBe('3 件を選択');
    expect(
      describeColumnFilterValue({ kind: 'set', mode: 'include', values: [] }),
    ).toBe('0 件を選択');
  });

  it('set(exclude)は件数に依らず「N 件を除外」(1 件でも列挙しない)', () => {
    expect(
      describeColumnFilterValue({ kind: 'set', mode: 'exclude', values: ['A'] }),
    ).toBe('1 件を除外');
    expect(
      describeColumnFilterValue({
        kind: 'set',
        mode: 'exclude',
        values: ['A', 'B', 'C'],
      }),
    ).toBe('3 件を除外');
  });

  it('custom は非空 string なら「"x"」(trim)、それ以外は「カスタム条件」', () => {
    expect(
      describeColumnFilterValue({ kind: 'custom', value: ' my-cond ' }),
    ).toBe('"my-cond"');
    expect(describeColumnFilterValue({ kind: 'custom', value: '' })).toBe(
      'カスタム条件',
    );
    expect(
      describeColumnFilterValue({ kind: 'custom', value: { min: 1 } }),
    ).toBe('カスタム条件');
  });
});