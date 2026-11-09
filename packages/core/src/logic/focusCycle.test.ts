// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFocusWrapTarget } from './focusCycle';

const setup = () => {
  const container = document.createElement('div');
  container.innerHTML = `
    <input id="a" />
    <button id="skip" tabindex="-1">x</button>
    <button id="disabled" disabled>x</button>
    <label><input id="b" type="checkbox" /> b</label>
    <button id="c">c</button>
  `;
  document.body.appendChild(container);
  const get = (id: string) => container.querySelector<HTMLElement>(`#${id}`)!;
  return { container, get };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveFocusWrapTarget(AP-32)', () => {
  it('最後の要素で Tab なら先頭へ、先頭で Shift+Tab なら最後へ', () => {
    const { container, get } = setup();
    expect(resolveFocusWrapTarget(container, get('c'), false)).toBe(get('a'));
    expect(resolveFocusWrapTarget(container, get('a'), true)).toBe(get('c'));
  });

  it('途中の要素ではブラウザの既定の移動に任せる(null)', () => {
    const { container, get } = setup();
    expect(resolveFocusWrapTarget(container, get('a'), false)).toBeNull();
    expect(resolveFocusWrapTarget(container, get('b'), true)).toBeNull();
    expect(resolveFocusWrapTarget(container, get('c'), true)).toBeNull();
  });

  it('tabindex="-1" の要素にあるときは文書の順で決める', () => {
    const { container, get } = setup();
    expect(resolveFocusWrapTarget(container, get('skip'), false)).toBeNull();
    expect(resolveFocusWrapTarget(container, get('skip'), true)).toBeNull();
    const tail = document.createElement('button');
    tail.tabIndex = -1;
    container.appendChild(tail);
    expect(resolveFocusWrapTarget(container, tail, false)).toBe(get('a'));
  });

  it('外の要素や null のときは何もしない', () => {
    const { container } = setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    expect(resolveFocusWrapTarget(container, outside, false)).toBeNull();
    expect(resolveFocusWrapTarget(container, null, false)).toBeNull();
  });
});