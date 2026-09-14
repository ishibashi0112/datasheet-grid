// 追加(slot-props): 命令的 DOM へのスロット反映(applySlotToElement)のテストです。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applySlotToElement } from './slotDom';

describe('applySlotToElement', () => {
  it('className を空白区切りで追加し、style を kebab-case / カスタムプロパティで設定する', () => {
    const el = document.createElement('div');
    el.className = 'ssg-tooltip';
    const applied = applySlotToElement(el, {
      className: 'x1  x2',
      style: { backgroundColor: 'red', '--x-gap': '4px', zIndex: 5 },
    });
    expect(el.className).toBe('ssg-tooltip x1 x2');
    expect(el.style.getPropertyValue('background-color')).toBe('red');
    expect(el.style.getPropertyValue('--x-gap')).toBe('4px');
    expect(el.style.getPropertyValue('z-index')).toBe('5');
    expect(applied).toEqual({
      classNames: ['x1', 'x2'],
      styleKeys: ['background-color', '--x-gap', 'z-index'],
    });
  });

  it('前回適用分を外してから当て直す(既存の別クラス / style は保持)', () => {
    const el = document.createElement('div');
    el.className = 'ssg-tooltip ssg-tooltip--visible';
    el.style.setProperty('left', '10px');
    const first = applySlotToElement(el, {
      className: 'a',
      style: { color: 'red' },
    });
    applySlotToElement(el, { className: 'b' }, first);
    expect(el.className).toBe('ssg-tooltip ssg-tooltip--visible b');
    expect(el.style.getPropertyValue('color')).toBe('');
    expect(el.style.getPropertyValue('left')).toBe('10px');
    // undefined スロットは前回分の除去のみ。
    const second = applySlotToElement(el, undefined, { classNames: ['b'], styleKeys: [] });
    expect(el.className).toBe('ssg-tooltip ssg-tooltip--visible');
    expect(second).toEqual({ classNames: [], styleKeys: [] });
  });
});