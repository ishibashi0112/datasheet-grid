// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-29): 祖先の transform: scale() の倍率を求める。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveElementScale } from './elementScale';

const element = (offsetWidth: number, offsetHeight: number): HTMLElement => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetWidth', { value: offsetWidth });
  Object.defineProperty(el, 'offsetHeight', { value: offsetHeight });
  return el;
};

describe('resolveElementScale(AP-29)', () => {
  it('見た目 ÷ レイアウトの比。差が 1px 未満(小数の幅の丸め)や 0 のときは 1', () => {
    expect(resolveElementScale(element(1000, 400), { width: 800, height: 320 })).toEqual({ x: 0.8, y: 0.8 });
    expect(resolveElementScale(element(301, 400), { width: 300.5, height: 400 })).toEqual({ x: 1, y: 1 });
    expect(resolveElementScale(element(1000, 400), { width: 0, height: 0 })).toEqual({ x: 1, y: 1 });
    expect(resolveElementScale(element(0, 0), { width: 800, height: 320 })).toEqual({ x: 1, y: 1 });
    expect(resolveElementScale(null)).toEqual({ x: 1, y: 1 });
  });
});