// 追加(date-input): 外側クリック判定(keep-open 属性のオプトアウト込み)の単体テストです。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';

import {
  FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE,
  isFilterPopoverOutsideTarget,
} from './filterPopoverOutsideClick';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isFilterPopoverOutsideTarget', () => {
  it('popover の内側は外側扱いしない(閉じない)', () => {
    const popover = document.createElement('div');
    const inner = document.createElement('button');
    popover.appendChild(inner);
    document.body.appendChild(popover);
    expect(isFilterPopoverOutsideTarget(inner, popover)).toBe(false);
  });

  it('popover の外の要素は外側扱い(閉じる)', () => {
    const popover = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(popover);
    document.body.appendChild(outside);
    expect(isFilterPopoverOutsideTarget(outside, popover)).toBe(true);
  });

  it('keep-open 属性を持つ要素の内側は外側扱いしない(外部ピッカーのポータル)', () => {
    const popover = document.createElement('div');
    document.body.appendChild(popover);
    // 外部ピッカーが body 直下ポータルに出したカレンダーを模します。
    const pickerPortal = document.createElement('div');
    pickerPortal.setAttribute(FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE, '');
    const dayButton = document.createElement('button');
    pickerPortal.appendChild(dayButton);
    document.body.appendChild(pickerPortal);
    expect(isFilterPopoverOutsideTarget(dayButton, popover)).toBe(false);
    // 属性が無い同型のポータルは従来どおり外側扱いです。
    const plainPortal = document.createElement('div');
    const plainButton = document.createElement('button');
    plainPortal.appendChild(plainButton);
    document.body.appendChild(plainPortal);
    expect(isFilterPopoverOutsideTarget(plainButton, popover)).toBe(true);
  });

  it('テキストノードは親要素基準で判定する', () => {
    const keepOpen = document.createElement('div');
    keepOpen.setAttribute(FILTER_POPOVER_KEEP_OPEN_ATTRIBUTE, '');
    const text = document.createTextNode('2026-08-27');
    keepOpen.appendChild(text);
    document.body.appendChild(keepOpen);
    expect(isFilterPopoverOutsideTarget(text, null)).toBe(false);
  });

  it('target が null なら閉じない(防御)', () => {
    expect(isFilterPopoverOutsideTarget(null, null)).toBe(false);
  });
});
