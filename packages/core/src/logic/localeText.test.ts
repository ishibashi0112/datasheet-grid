// 追加(段階 2 DU-18): 文言(localeText)の既定値・置き換え・中身が同じなら同じ参照を返すこと。
import { describe, expect, it } from 'vitest';

import { DEFAULT_GRID_LOCALE_TEXT, createLocaleTextResolver, formatLocaleText } from './localeText';

describe('formatLocaleText', () => {
  it('{name} を値に置き換え、値の無い名前は残す', () => {
    expect(formatLocaleText('行 {shown} / {total}', { shown: 3, total: 10 })).toBe('行 3 / 10');
    expect(formatLocaleText('{a} {missing}', { a: 'x' })).toBe('x {missing}');
  });

  it('値の中の {name} や $ は置き換えない', () => {
    expect(formatLocaleText('並び替え: {value}', { value: '{total} $& 金額' })).toBe('並び替え: {total} $& 金額');
  });
});

describe('createLocaleTextResolver', () => {
  it('未指定なら既定(日本語)', () => {
    const resolve = createLocaleTextResolver();
    expect(resolve(undefined)).toBe(DEFAULT_GRID_LOCALE_TEXT);
    expect(resolve(undefined).rowCount).toBe('行 {shown} / {total}');
  });

  it('渡したキーだけ置き換え、undefined のキーは既定のまま', () => {
    const resolve = createLocaleTextResolver();
    const texts = resolve({ rowCount: 'Rows: {shown} / {total}', none: undefined });
    expect(texts.rowCount).toBe('Rows: {shown} / {total}');
    expect(texts.none).toBe('なし');
    expect(texts.columnCount).toBe(DEFAULT_GRID_LOCALE_TEXT.columnCount);
  });

  it('中身が同じなら、別のオブジェクトでも同じ参照を返す', () => {
    const resolve = createLocaleTextResolver();
    const first = resolve({ rowCount: 'Rows: {shown}' });
    expect(resolve({ rowCount: 'Rows: {shown}' })).toBe(first);
    const changed = resolve({ rowCount: 'R {shown}' });
    expect(changed).not.toBe(first);
    expect(changed.rowCount).toBe('R {shown}');
    expect(resolve(undefined)).toBe(DEFAULT_GRID_LOCALE_TEXT);
  });
});
