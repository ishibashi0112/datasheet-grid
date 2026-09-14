// 追加(非依存化 ③-1): tooltipController の DOM テストです(React 非依存で acquire / dispose を直接呼ぶ)。
//   hooks/useGridTooltip.test.ts(hook 経由の回帰テスト)と対になり、こちらはコントローラの
//   ライフサイクル(refCount / 二重 dispose)とスロット反映を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireTooltipController } from './tooltipController';

const findTooltip = () => document.querySelector<HTMLElement>('.ssg-tooltip');
const isVisible = () =>
  findTooltip()?.classList.contains('ssg-tooltip--visible') === true;

describe('tooltipController', () => {
  let target: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('button');
    target.setAttribute('data-ssg-tooltip', 'ヒント');
    document.body.appendChild(target);
  });

  afterEach(() => {
    vi.useRealTimers();
    target.remove();
  });

  it('pointerover → 遅延後に表示、pointerout で非表示、dispose で要素撤去', () => {
    const controller = acquireTooltipController();
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(isVisible()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(isVisible()).toBe(true);
    expect(findTooltip()?.textContent).toBe('ヒント');

    target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    expect(isVisible()).toBe(false);

    controller.dispose();
    expect(findTooltip()).toBeNull();
    // dispose 後はリスナーも外れている(表示されない)。
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(findTooltip()).toBeNull();
  });

  it('複数の参照で共有し、最後の dispose まで撤去しない(二重 dispose は no-op)', () => {
    const a = acquireTooltipController();
    const b = acquireTooltipController();
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(isVisible()).toBe(true);

    a.dispose();
    a.dispose();
    expect(findTooltip()).not.toBeNull();
    // まだ b が生きているので表示系は動く。
    target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    expect(isVisible()).toBe(false);

    b.dispose();
    expect(findTooltip()).toBeNull();
  });

  it('setSlot で共有要素へ className / style を反映し、差し替え時は前回分を外す', () => {
    const controller = acquireTooltipController({
      className: 'x-tip',
      style: { '--x-gap': '4px' },
    });
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(400);
    const el = findTooltip();
    expect(el?.classList.contains('x-tip')).toBe(true);
    expect(el?.style.getPropertyValue('--x-gap')).toBe('4px');

    controller.setSlot({ className: 'y-tip' });
    expect(el?.classList.contains('x-tip')).toBe(false);
    expect(el?.classList.contains('y-tip')).toBe(true);
    expect(el?.style.getPropertyValue('--x-gap')).toBe('');
    // 基底クラスと表示状態は保持される。
    expect(el?.classList.contains('ssg-tooltip')).toBe(true);
    expect(isVisible()).toBe(true);
    controller.dispose();
  });

  it('Escape / pointerdown で非表示、文言が空なら表示しない', () => {
    const controller = acquireTooltipController();
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(isVisible()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(isVisible()).toBe(false);

    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    // ウォームアップ内なので即時表示。
    expect(isVisible()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(isVisible()).toBe(false);

    const empty = document.createElement('span');
    empty.setAttribute('data-ssg-tooltip', '');
    document.body.appendChild(empty);
    empty.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(isVisible()).toBe(false);
    empty.remove();
    controller.dispose();
  });
});