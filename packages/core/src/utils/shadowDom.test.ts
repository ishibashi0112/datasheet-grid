// 追加(1.3.0 / Solid 版の品質の段 2 S11-01〜05): Shadow DOM の中のイベントの target とフォーカスのある要素。
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { findElementById, getActiveElement, getEventTarget, getShadowRoot } from './shadowDom';

const makeShadow = (mode: ShadowRootMode = 'open') => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode });
  shadow.innerHTML = '<div id="app"><button id="a">a</button><button id="b">b</button></div>';
  return { host, shadow };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('getEventTarget', () => {
  it('window で受けたイベントでも、Shadow root の中で起きた要素を返す(event.target は host)', () => {
    const { host, shadow } = makeShadow();
    const button = shadow.querySelector('#a')!;
    let seen: { target: EventTarget | null; real: EventTarget | null } | null = null;
    const listener = (event: Event) => {
      seen = { target: event.target, real: getEventTarget(event) };
    };
    window.addEventListener('pointerdown', listener, true);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    window.removeEventListener('pointerdown', listener, true);
    expect(seen).toEqual({ target: host, real: button });
  });

  it('ふつうの DOM ではイベントの target', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const event = new Event('click', { bubbles: true });
    let real: EventTarget | null = null;
    button.addEventListener('click', (e) => {
      real = getEventTarget(e);
    });
    button.dispatchEvent(event);
    expect(real).toBe(button);
  });
});

describe('getActiveElement', () => {
  it('Shadow root の中のフォーカス(document.activeElement は host)', () => {
    const { host, shadow } = makeShadow();
    const b = shadow.querySelector<HTMLElement>('#b')!;
    b.focus();
    expect(document.activeElement).toBe(host);
    expect(getActiveElement()).toBe(b);
    expect(getActiveElement(shadow.querySelector('#a'))).toBe(b);
  });

  it('closed の Shadow root も、中の要素から見ればフォーカスが分かる', () => {
    const { shadow } = makeShadow('closed');
    const a = shadow.querySelector<HTMLElement>('#a')!;
    a.focus();
    expect(getActiveElement(a)).toBe(a);
  });

  it('Shadow root の外にフォーカスがあるときは document のフォーカス', () => {
    const { shadow } = makeShadow();
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    expect(getActiveElement(shadow.querySelector('#a'))).toBe(outside);
    expect(getActiveElement(document)).toBe(outside);
  });
});

describe('findElementById / getShadowRoot', () => {
  it('Shadow root の中の要素を id で引く(document.getElementById は見ない)', () => {
    const { shadow } = makeShadow();
    const a = shadow.querySelector('#a')!;
    expect(document.getElementById('b')).toBeNull();
    expect(findElementById(a, 'b')).toBe(shadow.querySelector('#b'));
    expect(getShadowRoot(a)).toBe(shadow);
    expect(getShadowRoot(document.body)).toBeNull();
  });
});