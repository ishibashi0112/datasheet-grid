// logic/checkboxEditor(checkbox エディタ純ロジック)の単体テストです。
import { describe, expect, it } from 'vitest';
import {
  isCheckboxChecked,
  parseCheckboxEditorValue,
  resolveCheckboxValues,
  toggleCheckboxValue,
} from './checkboxEditor';

describe('resolveCheckboxValues', () => {
  it('未指定は true / false、指定時はその値を使う', () => {
    expect(resolveCheckboxValues({})).toEqual({
      checkedValue: true,
      uncheckedValue: false,
    });
    expect(
      resolveCheckboxValues({ checkedValue: '有', uncheckedValue: '無' }),
    ).toEqual({ checkedValue: '有', uncheckedValue: '無' });
    // 0 / '' のような falsy 値も明示指定として尊重される(?? のため nullish のみ既定化)。
    expect(
      resolveCheckboxValues({ checkedValue: 1, uncheckedValue: 0 }),
    ).toEqual({ checkedValue: 1, uncheckedValue: 0 });
  });
});

describe('isCheckboxChecked / toggleCheckboxValue', () => {
  it('checked 判定は Object.is 一致のみ(それ以外はすべて unchecked)', () => {
    expect(isCheckboxChecked(true, {})).toBe(true);
    expect(isCheckboxChecked(false, {})).toBe(false);
    expect(isCheckboxChecked('true', {})).toBe(false);
    expect(isCheckboxChecked(null, {})).toBe(false);
    expect(isCheckboxChecked('有', { checkedValue: '有' })).toBe(true);
  });

  it('トグルは checked ⇄ unchecked を往復し、不正値からは checked へ倒す', () => {
    expect(toggleCheckboxValue(true, {})).toBe(false);
    expect(toggleCheckboxValue(false, {})).toBe(true);
    // unchecked でも checked でもない値(null / 不正値)はトグルで checked になる。
    expect(toggleCheckboxValue(null, {})).toBe(true);
    const editor = { checkedValue: '有', uncheckedValue: '無' };
    expect(toggleCheckboxValue('有', editor)).toBe('無');
    expect(toggleCheckboxValue('無', editor)).toBe('有');
  });
});

describe('parseCheckboxEditorValue', () => {
  it('空文字は uncheckedValue(クリア = 未チェック)', () => {
    expect(parseCheckboxEditorValue('', {})).toBe(false);
    expect(
      parseCheckboxEditorValue('', { uncheckedValue: '無' }),
    ).toBe('無');
  });

  it('checked / unchecked の文字列表現に一致すれば対応値を返す', () => {
    expect(parseCheckboxEditorValue('true', {})).toBe(true);
    expect(parseCheckboxEditorValue('false', {})).toBe(false);
    const editor = { checkedValue: '有', uncheckedValue: '無' };
    expect(parseCheckboxEditorValue('有', editor)).toBe('有');
    expect(parseCheckboxEditorValue('無', editor)).toBe('無');
  });

  it("'true' / '1'(大文字小文字無視)は checked、その他は unchecked へ倒す", () => {
    expect(parseCheckboxEditorValue('TRUE', {})).toBe(true);
    expect(parseCheckboxEditorValue('1', { checkedValue: '有' })).toBe('有');
    expect(parseCheckboxEditorValue('不正値', {})).toBe(false);
    expect(parseCheckboxEditorValue('yes', {})).toBe(false);
  });
});