// 追加(Solid 版 段階 1-2): 組み込みエディタを開く値と確定する値(React 版の editors/ から移した決め方)。
import { describe, expect, it } from 'vitest';
import {
  readTypedDateCommitValue,
  resolveNumberEditorCommitValue,
  resolveNumberEditorStart,
  resolveTypedStartText,
} from './editorStart';

describe('resolveTypedStartText', () => {
  it('セル値の文字列と同じなら undefined(F2 / Enter / ダブルクリック)、違えば打ち始めた文字', () => {
    expect(resolveTypedStartText('東京', '東京')).toBeUndefined();
    expect(resolveTypedStartText('12', 12)).toBeUndefined();
    expect(resolveTypedStartText('', null)).toBeUndefined();
    expect(resolveTypedStartText('a', '東京')).toBe('a');
  });
});

describe('resolveNumberEditorStart', () => {
  it('空は number のまま、書き始め("-" / "." など)は text で開く', () => {
    expect(resolveNumberEditorStart('')).toEqual({ text: '', textMode: false });
    expect(resolveNumberEditorStart('-')).toEqual({ text: '-', textMode: true });
    expect(resolveNumberEditorStart('.')).toEqual({ text: '.', textMode: true });
  });

  it('数値は半角の表記へ直し、読めない文字は text でそのまま見せる(FC-17)', () => {
    expect(resolveNumberEditorStart('1,234')).toEqual({ text: '1234', textMode: false });
    expect(resolveNumberEditorStart('１２')).toEqual({ text: '12', textMode: false });
    expect(resolveNumberEditorStart('a')).toEqual({ text: 'a', textMode: true });
  });
});

describe('resolveNumberEditorCommitValue', () => {
  it('text のセッションが書き始めのままなら空、それ以外は打った文字列のまま', () => {
    expect(resolveNumberEditorCommitValue('-', true)).toBe('');
    expect(resolveNumberEditorCommitValue('ー', true)).toBe('');
    expect(resolveNumberEditorCommitValue('-5', true)).toBe('-5');
    expect(resolveNumberEditorCommitValue('-', false)).toBe('-');
  });
});

describe('readTypedDateCommitValue', () => {
  it('空は空、読めれば YYYY-MM-DD、読めなければ null', () => {
    expect(readTypedDateCommitValue('  ')).toBe('');
    expect(readTypedDateCommitValue('2026/3/15')).toBe('2026-03-15');
    expect(readTypedDateCommitValue('２０２６年３月１５日')).toBe('2026-03-15');
    expect(readTypedDateCommitValue('あした')).toBeNull();
  });
});