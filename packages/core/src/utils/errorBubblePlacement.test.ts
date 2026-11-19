// 追加(Solid 版 段階 1-2): エラーの吹き出しの置き方(React 版の editors/CellEditorErrorBubble.tsx から移したもの)。
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { ERROR_BUBBLE_ABOVE_CLASS, placeErrorBubble } from './errorBubblePlacement';

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

// .ssg-scroll-container(0,0 から 1000 × 500)> .ssg-center-pane > .ssg-cell-editor > 吹き出し。
const build = (bubble: { left: number; top: number; width: number; height: number }, anchorTop: number) => {
  const container = document.createElement('div');
  container.className = 'ssg-scroll-container';
  Object.defineProperty(container, 'clientWidth', { value: 1000 });
  Object.defineProperty(container, 'clientHeight', { value: 500 });
  container.getBoundingClientRect = () => rect(0, 0, 1000, 500);
  const center = document.createElement('div');
  center.className = 'ssg-center-pane';
  const editor = document.createElement('div');
  editor.className = 'ssg-cell-editor';
  editor.getBoundingClientRect = () => rect(bubble.left, anchorTop, 100, 28);
  const element = document.createElement('div');
  // 折り返すと幅が決めた値になる(style.width を読む)。
  element.getBoundingClientRect = () => {
    const width = element.style.width ? Number.parseFloat(element.style.width) : bubble.width;
    return rect(bubble.left, bubble.top, width, bubble.height);
  };
  editor.append(element);
  center.append(editor);
  container.append(center);
  document.body.append(container);
  return element;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('placeErrorBubble', () => {
  it('見えている範囲に収まれば下のまま・ずらさない', () => {
    const element = build({ left: 100, top: 60, width: 200, height: 24 }, 30);
    expect(placeErrorBubble(element)).toEqual({ above: false, shift: 0, wrapWidth: null });
    expect(element.classList.contains(ERROR_BUBBLE_ABOVE_CLASS)).toBe(false);
  });

  it('下端にかかれば上へ、右へはみ出す分は左へずらす', () => {
    const element = build({ left: 900, top: 490, width: 200, height: 24 }, 460);
    const placement = placeErrorBubble(element);
    expect(placement.above).toBe(true);
    expect(placement.shift).toBe(900 + 200 - 996);
    expect(element.classList.contains(ERROR_BUBBLE_ABOVE_CLASS)).toBe(true);
    expect(element.style.left).toBe(`${-(900 + 200 - 996)}px`);
  });

  it('見えている範囲より広い文言はその幅で折り返す', () => {
    const element = build({ left: 0, top: 60, width: 1200, height: 24 }, 30);
    expect(placeErrorBubble(element).wrapWidth).toBe(992);
    expect(element.style.width).toBe('992px');
    expect(element.style.whiteSpace).toBe('normal');
  });

  it('測り直すときは前の配置を外してから測る(上に出した印が残らない)', () => {
    const element = build({ left: 100, top: 60, width: 200, height: 24 }, 30);
    element.classList.add(ERROR_BUBBLE_ABOVE_CLASS);
    element.style.left = '-40px';
    expect(placeErrorBubble(element)).toEqual({ above: false, shift: 0, wrapWidth: null });
    expect(element.classList.contains(ERROR_BUBBLE_ABOVE_CLASS)).toBe(false);
    expect(element.style.left).toBe('');
  });
});