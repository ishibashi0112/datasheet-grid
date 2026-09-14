// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useGridTooltip } from './useGridTooltip';

// jsdom 上の DOM 動作テストです。表示遅延はフェイクタイマーで進めます。
// 位置(left/top)は jsdom の getBoundingClientRect が全 0 のため検証対象外とし、
// 「表示/非表示」「文言」「ライフサイクル」を固定します。

function findTooltip(): HTMLElement | null {
  return document.querySelector('.ssg-tooltip');
}

function isVisible(): boolean {
  const el = findTooltip();
  return el !== null && el.classList.contains('ssg-tooltip--visible');
}

describe('useGridTooltip', () => {
  let target: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('button');
    target.setAttribute('data-ssg-tooltip', '列メニュー');
    document.body.appendChild(target);
  });

  afterEach(() => {
    vi.useRealTimers();
    target.remove();
  });

  it('pointerover から遅延後に文言つきで表示される', () => {
    const hook = renderHook(() => useGridTooltip());
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    // 遅延前は未表示です。
    expect(isVisible()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(isVisible()).toBe(true);
    expect(findTooltip()?.textContent).toBe('列メニュー');
    hook.unmount();
  });

  it('遅延前に pointerout すると表示されない', () => {
    const hook = renderHook(() => useGridTooltip());
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(isVisible()).toBe(false);
    hook.unmount();
  });

  it('表示後の pointerout で非表示になり、ウォームアップ内の再 hover は即時表示', () => {
    const hook = renderHook(() => useGridTooltip());
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    expect(isVisible()).toBe(true);
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    });
    expect(isVisible()).toBe(false);
    // ウォームアップ(800ms)内の再 hover → 遅延なしで即時表示されます。
    act(() => {
      vi.advanceTimersByTime(200);
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    expect(isVisible()).toBe(true);
    hook.unmount();
  });

  it('focusin でも表示される(キーボード操作)', () => {
    const hook = renderHook(() => useGridTooltip());
    act(() => {
      target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    expect(isVisible()).toBe(true);
    hook.unmount();
  });

  it('Escape / pointerdown で非表示になる', () => {
    const hook = renderHook(() => useGridTooltip());
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    expect(isVisible()).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(isVisible()).toBe(false);
    // 再表示(ウォームアップ内 → 即時)して pointerdown でも消えることを確認します。
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    expect(isVisible()).toBe(true);
    act(() => {
      target.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      );
    });
    expect(isVisible()).toBe(false);
    hook.unmount();
  });

  it('data-ssg-tooltip が空文字の要素では表示しない', () => {
    const hook = renderHook(() => useGridTooltip());
    target.setAttribute('data-ssg-tooltip', '');
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(1000);
    });
    expect(isVisible()).toBe(false);
    hook.unmount();
  });

  it('最後のアンマウントで要素が撤去される(refCount 共有)', () => {
    const first = renderHook(() => useGridTooltip());
    const second = renderHook(() => useGridTooltip());
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    expect(findTooltip()).not.toBeNull();
    // 片方のアンマウントでは残ります(もう一方のグリッドが使用中)。
    first.unmount();
    expect(findTooltip()).not.toBeNull();
    second.unmount();
    expect(findTooltip()).toBeNull();
    // 全撤去後はイベントに反応しません。
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(1000);
    });
    expect(findTooltip()).toBeNull();
  });
});