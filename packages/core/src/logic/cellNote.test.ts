// 追加(G-3): セルのメモ(cellNote)の正規化と、ツールチップ文言の合成の契約テストです。
import { describe, it, expect } from 'vitest';
import { normalizeCellNote, resolveCellTooltipText } from './cellNote';

describe('normalizeCellNote', () => {
  it('空でない文字列はそのまま(改行も保つ)', () => {
    expect(normalizeCellNote('NBOM 側に存在しません。')).toBe('NBOM 側に存在しません。');
    expect(normalizeCellNote('品番 A\n他 2 箇所でも使用')).toBe('品番 A\n他 2 箇所でも使用');
  });

  it('undefined / null / 空文字 / 空白だけ / 文字列以外は「メモなし」(null)', () => {
    expect(normalizeCellNote(undefined)).toBeNull();
    expect(normalizeCellNote(null)).toBeNull();
    expect(normalizeCellNote('')).toBeNull();
    expect(normalizeCellNote(' \n ')).toBeNull();
    expect(normalizeCellNote(0)).toBeNull();
  });
});

describe('resolveCellTooltipText', () => {
  it('どちらも無ければ null(属性を付けない)', () => {
    expect(resolveCellTooltipText(null, null)).toBeNull();
  });

  it('片方だけならその文言', () => {
    expect(resolveCellTooltipText('0 以上で入力してください', null)).toBe('0 以上で入力してください');
    expect(resolveCellTooltipText(null, '元品番 A1234 の代表品番です。')).toBe('元品番 A1234 の代表品番です。');
  });

  it('両方あれば「エラー → 改行 → メモ」の順につなぐ', () => {
    expect(resolveCellTooltipText('0 以上で入力してください', '販売単価が 0 円で登録されています。')).toBe(
      '0 以上で入力してください\n販売単価が 0 円で登録されています。',
    );
  });
});