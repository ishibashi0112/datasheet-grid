// 追加(1.0.2 / 2026-11-09 実アプリの総点検 A-09 / B-05): エディタの部品を見えている範囲へ収めるずらし量。
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { resolveEditorVisibleX, resolveShiftIntoView } from './editorVisibleBounds';

const rect = (left: number, width: number) =>
  ({ left, right: left + width, top: 0, bottom: 20, width, height: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

const setRect = (element: Element, left: number, width: number) => {
  element.getBoundingClientRect = () => rect(left, width);
};

// .ssg-scroll-container > [左ペイン, .ssg-center-pane > 部品, 右ペイン] を組む(clientWidth は幅のまま)。
const build = (target: { left: number; width: number }, withPanes = true) => {
  const container = document.createElement('div');
  container.className = 'ssg-scroll-container';
  Object.defineProperty(container, 'clientWidth', { value: 1000 });
  setRect(container, 0, 1000);
  const leftPane = document.createElement('div');
  setRect(leftPane, 0, 100);
  const center = document.createElement('div');
  center.className = 'ssg-center-pane';
  const rightPane = document.createElement('div');
  setRect(rightPane, 880, 120);
  const element = document.createElement('div');
  setRect(element, target.left, target.width);
  center.append(element);
  container.append(...(withPanes ? [leftPane, center, rightPane] : [center]));
  document.body.append(container);
  return element;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveShiftIntoView', () => {
  it('右の固定ペインの下へはみ出す分だけ左へずらす(4px の余白を残す)', () => {
    const element = build({ left: 800, width: 150 });
    expect(resolveEditorVisibleX(element)).toEqual({ left: 100, right: 880 });
    expect(resolveShiftIntoView(element)).toBe(800 + 150 - 876);
  });

  it('収まっていればずらさない', () => {
    expect(resolveShiftIntoView(build({ left: 300, width: 150 }))).toBe(0);
  });

  it('左の固定ペインの端を越えてはずらさない', () => {
    expect(resolveShiftIntoView(build({ left: 120, width: 900 }))).toBe(20);
  });

  it('固定ペインが無ければスクロールの枠の右端まで', () => {
    expect(resolveShiftIntoView(build({ left: 900, width: 150 }, false))).toBe(900 + 150 - 996);
  });

  it('グリッドの外(枠が無い)や大きさの無い環境ではずらさない', () => {
    const lone = document.createElement('div');
    document.body.append(lone);
    expect(resolveShiftIntoView(lone)).toBe(0);
  });
});