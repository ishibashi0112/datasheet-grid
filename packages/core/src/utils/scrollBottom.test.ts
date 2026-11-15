// 追加(1.2.0 の確かめ): 末尾にいるかの判定(utils/scrollBottom)のテストです。
import { describe, it, expect } from 'vitest';
import { isScrolledToBottom } from './scrollBottom';

const el = (scrollHeight: number, scrollTop: number, clientHeight: number) =>
  ({ scrollHeight, scrollTop, clientHeight }) as unknown as HTMLElement;

describe('isScrolledToBottom', () => {
  it('末尾ちょうど・中身が見える高さより低いときは true', () => {
    expect(isScrolledToBottom(el(1000, 700, 300))).toBe(true);
    expect(isScrolledToBottom(el(200, 0, 300))).toBe(true);
  });

  it('拡大縮小の小数と、Firefox が大きな高さを丸める 2px までの差は末尾とみなす', () => {
    expect(isScrolledToBottom(el(1000, 699.5, 300))).toBe(true);
    // Firefox の 100 万行の表: scrollHeight 15000042 / clientHeight 408 で、scrollToBottom() の後の scrollTop は 14999632。
    expect(isScrolledToBottom(el(15000042, 14999632, 408))).toBe(true);
    expect(isScrolledToBottom(el(1000, 697.9, 300))).toBe(false);
    expect(isScrolledToBottom(el(1000, 0, 300))).toBe(false);
  });
});