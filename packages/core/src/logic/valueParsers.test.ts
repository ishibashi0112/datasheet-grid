// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-09): 組み込みの数値のパーサ(numberParser)。
import { describe, expect, it } from 'vitest';
import { numberParser } from './valueParsers';
import { resolveCellParser } from './editorValues';
import type { GridColumn } from '../model/gridTypes.unbound';

describe('numberParser', () => {
  it('オプションなしは number エディタの既定のパーサと同じ読み方', () => {
    const parse = numberParser();
    const builtin = resolveCellParser({ key: 'n', title: 'n', width: 80, editor: { type: 'number' } } as GridColumn<object>);
    for (const raw of ['', '   ', '12', '1,234', '１，２３４', 'ー５', '1.5', '-0.25', 'abc', '¥12,000', '12,000円', '(1,200)']) {
      expect(parse(raw)).toEqual(builtin(raw, {}));
    }
    expect(parse('1,234')).toBe(1234);
    expect(parse('')).toBeNull();
    expect(parse('abc')).toBe('abc');
  });

  it('strip で通貨記号や単位を先に外す(外したあとが数値でなければ元の文字のまま)', () => {
    const parse = numberParser({ strip: ['¥', '￥', '円', '$', ''] });
    expect(parse('¥12,000')).toBe(12000);
    expect(parse('12,000円')).toBe(12000);
    expect(parse('￥１２，０００')).toBe(12000);
    expect(parse('$-3.5')).toBe(-3.5);
    expect(parse('¥')).toBe('¥');
    expect(parse('約 1,000 円')).toBe('約 1,000 円');
    expect(parse(' ')).toBeNull();
  });

  it('negativeParentheses でかっこの数を負の数に(既定は読まない)', () => {
    expect(numberParser()('(1,200)')).toBe('(1,200)');
    const parse = numberParser({ strip: ['¥'], negativeParentheses: true });
    expect(parse('(1,200)')).toBe(-1200);
    expect(parse('（¥1,200）')).toBe(-1200);
    expect(parse(' (0) ')).toBe(0);
    expect(parse('()')).toBe('()');
    expect(parse('1,200')).toBe(1200);
    // 追加(1.1.0 / AP-09 の見直し): かっこの中に符号があるときは読まない(正の数にしない)
    expect(parse('(-5)')).toBe('(-5)');
    expect(parse('(−1,200)')).toBe('(−1,200)');
    expect(parse('（ー３）')).toBe('（ー３）');
    expect(parse('(+5)')).toBe('(+5)');
  });
});