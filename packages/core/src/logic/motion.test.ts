// 追加(motion-0): resolveGridMotion の純粋テストです。
import { describe, expect, it } from 'vitest';
import { MOTION_OFF_CLASS_NAME, resolveGridMotion } from './motion';

describe('resolveGridMotion', () => {
  it("'on' / 'off' は OS 設定に依らずそのまま返す", () => {
    expect(resolveGridMotion('on', true)).toBe('on');
    expect(resolveGridMotion('off', false)).toBe('off');
  });

  it("'auto' は prefers-reduced-motion: reduce に従う", () => {
    expect(resolveGridMotion('auto', true)).toBe('off');
    expect(resolveGridMotion('auto', false)).toBe('on');
  });

  it('修飾子クラス名は styles.css と一致する', () => {
    expect(MOTION_OFF_CLASS_NAME).toBe('ssg-motion-off');
  });
});
