// 追加(1.3.0 / Solid 版の品質の段 2 S11-01〜05): Shadow DOM の中のイベントの target とフォーカスのある要素。
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { findElementById, getActiveElement, getDeepActiveElement, getEventTarget, getShadowRoot } from './shadowDom';

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
    const app = shadow.querySelector('#app')!;
    let seen: { target: EventTarget | null; real: EventTarget | null; inDocument: EventTarget | null } | null = null;
    const listener = (event: Event) => {
      seen = { target: event.target, real: getEventTarget(event, app), inDocument: getEventTarget(event) };
    };
    window.addEventListener('pointerdown', listener, true);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    window.removeEventListener('pointerdown', listener, true);
    expect(seen).toEqual({ target: host, real: button, inDocument: host });
  });

  // 追加(1.3.0 の別視点のレビュー): グリッドの中に置いた Web Component の中で起きたイベントは、その host(グリッドの中)。
  it('context の木より奥(中に置いた Web Component の Shadow root)へは降りない', () => {
    const { shadow } = makeShadow();
    const app = shadow.querySelector('#app')!;
    const widget = document.createElement('x-widget');
    app.appendChild(widget);
    const inner = widget.attachShadow({ mode: 'open' });
    inner.innerHTML = '<input id="inner">';
    const input = inner.querySelector('#inner')!;
    let real: EventTarget | null = null;
    const listener = (event: Event) => {
      real = getEventTarget(event, app);
    };
    window.addEventListener('pointerdown', listener, true);
    input.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    window.removeEventListener('pointerdown', listener, true);
    expect(real).toBe(widget);
    expect(app.contains(widget)).toBe(true);
  });

  it('context の木を通らないイベントは document の木の要素', () => {
    const { shadow } = makeShadow();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    let real: EventTarget | null = null;
    const listener = (event: Event) => {
      real = getEventTarget(event, shadow.querySelector('#app'));
    };
    window.addEventListener('pointerdown', listener, true);
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    window.removeEventListener('pointerdown', listener, true);
    expect(real).toBe(outside);
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
    expect(getActiveElement()).toBe(host);
    expect(getDeepActiveElement()).toBe(b);
    expect(getActiveElement(shadow.querySelector('#a'))).toBe(b);
  });

  // 追加(1.3.0 の別視点のレビュー): ふつうの DOM のグリッドの中に置いた Web Component の中のフォーカスは、その host
  //   (1.2.1 の document.activeElement と同じ)。グリッドの中かは root.contains で分かる。
  it('context の木より奥(中に置いた Web Component の Shadow root)へは降りない', () => {
    const grid = document.createElement('div');
    document.body.appendChild(grid);
    const widget = document.createElement('x-field');
    grid.appendChild(widget);
    const inner = widget.attachShadow({ mode: 'open' });
    inner.innerHTML = '<input id="inner">';
    const input = inner.querySelector<HTMLInputElement>('#inner')!;
    input.focus();
    expect(getActiveElement(grid)).toBe(widget);
    expect(grid.contains(getActiveElement(grid))).toBe(true);
    expect(getDeepActiveElement()).toBe(input);
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