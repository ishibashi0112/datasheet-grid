// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-07): ポップアップを描く場所(popupContainer)の決め方と、fixed の基準のずれの打ち消し。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendToPopupContainer,
  findPopupHost,
  getPopupContainerFor,
  registerPopupContainer,
  resolvePopupContainer,
  syncPopupOrigin,
} from './popupContainer';

const make = (html: string): HTMLElement => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper;
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('findPopupHost / resolvePopupContainer', () => {
  it.each([
    ['<dialog id="host"><div><div id="grid"></div></div></dialog>'],
    ['<div id="host" popover><div id="grid"></div></div>'],
    ['<div id="host" aria-modal="true"><div id="grid"></div></div>'],
    ['<div id="host" role="dialog"><div id="grid"></div></div>'],
    ['<div id="host" role="alertdialog"><div id="grid"></div></div>'],
  ])('グリッドを囲むダイアログの中(%s)', (html) => {
    const root = make(html);
    const grid = root.querySelector<HTMLElement>('#grid')!;
    const host = root.querySelector<HTMLElement>('#host')!;
    expect(findPopupHost(grid)).toBe(host);
    expect(resolvePopupContainer(grid, 'auto')).toBe(host);
    expect(resolvePopupContainer(grid, undefined)).toBe(host);
  });

  it('いちばん近いダイアログ。aria-modal="false" や role の無い要素は見ない。グリッド自身も見ない', () => {
    const root = make(
      '<div role="dialog" id="outer"><div aria-modal="false"><div role="dialog" id="inner"><div id="grid" role="dialog"></div></div></div></div>',
    );
    const grid = root.querySelector<HTMLElement>('#grid')!;
    expect(resolvePopupContainer(grid, 'auto')).toBe(root.querySelector('#inner'));
    const plain = make('<section aria-modal="false"><div id="grid2"></div></section>').querySelector<HTMLElement>('#grid2')!;
    expect(resolvePopupContainer(plain, 'auto')).toBe(document.body);
  });

  it("'body' / 要素 / 関数 / グリッドがまだ無いとき", () => {
    const root = make('<div role="dialog"><div id="grid"></div></div><div id="other"></div>');
    const grid = root.querySelector<HTMLElement>('#grid')!;
    const other = root.querySelector<HTMLElement>('#other')!;
    expect(resolvePopupContainer(grid, 'body')).toBe(document.body);
    expect(resolvePopupContainer(grid, other)).toBe(other);
    // 要素はグリッドがまだ無くてもそのまま。
    expect(resolvePopupContainer(null, other)).toBe(other);
    const pick = vi.fn((element: HTMLElement) => (element === grid ? other : null));
    expect(resolvePopupContainer(grid, pick)).toBe(other);
    expect(pick).toHaveBeenCalledWith(grid);
    expect(resolvePopupContainer(grid, () => null)).toBe(document.body);
    expect(resolvePopupContainer(grid, () => undefined)).toBe(document.body);
    expect(resolvePopupContainer(null, 'auto')).toBe(document.body);
    expect(resolvePopupContainer(null, pick)).toBe(document.body);
  });
});

describe('getPopupContainerFor(ツールチップ / ゴースト)', () => {
  it('ポップアップの中の要素はそのポップアップと同じ場所、登録した表の中はその設定、ほかは auto', () => {
    const root = make(
      '<div role="dialog" id="dialog"><div class="ssg-root" id="root"><div class="ssg-shell" id="shell"><span id="cell"></span></div><span id="bar"></span></div></div>' +
        '<div id="elsewhere"><div class="ssg-menu-panel" id="menu"><button id="item"></button></div></div>' +
        '<span id="loose"></span>',
    );
    const q = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    // 登録前: auto と同じ(囲むダイアログ)。
    expect(getPopupContainerFor(q('cell'))).toBe(q('dialog'));
    expect(getPopupContainerFor(q('item'))).toBe(q('elsewhere'));
    expect(getPopupContainerFor(q('loose'))).toBe(document.body);
    expect(getPopupContainerFor(null)).toBe(document.body);
    // 登録後: 表(シェルと root)の中はその表の設定。
    const unregister = registerPopupContainer([q('shell'), q('root'), null], () => document.body);
    expect(getPopupContainerFor(q('cell'))).toBe(document.body);
    expect(getPopupContainerFor(q('bar'))).toBe(document.body);
    unregister();
    expect(getPopupContainerFor(q('cell'))).toBe(q('dialog'));
  });

  it('外すのは自分が登録したものだけ', () => {
    const root = make('<div id="shell"></div>');
    const shell = root.querySelector<HTMLElement>('#shell')!;
    const first = vi.fn(() => document.body);
    const other = document.createElement('div');
    const second = vi.fn(() => other);
    const unregisterFirst = registerPopupContainer([shell], first);
    registerPopupContainer([shell], second);
    unregisterFirst();
    expect(getPopupContainerFor(shell)).toBe(other);
  });
});

describe('syncPopupOrigin / appendToPopupContainer', () => {
  const stubProbeRect = (left: number, top: number) => {
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.style.position === 'fixed' && this.style.visibility === 'hidden') {
        return { left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top, toJSON: () => ({}) } as DOMRect;
      }
      return original.call(this);
    });
  };

  it('基準の原点がずれていれば translate で打ち消し、測った要素は残さない', () => {
    const host = make('<div role="dialog" id="host"></div>').querySelector<HTMLElement>('#host')!;
    stubProbeRect(120, 40);
    const popup = document.createElement('div');
    appendToPopupContainer(popup, host);
    expect(popup.parentElement).toBe(host);
    expect(popup.style.getPropertyValue('translate')).toBe('-120px -40px');
    expect(host.children.length).toBe(1);
  });

  it('ずれが無ければ書かず、前に書いた値は外す。body の直下は測らない', () => {
    const host = make('<div role="dialog" id="host"></div>').querySelector<HTMLElement>('#host')!;
    stubProbeRect(0, 0);
    const popup = document.createElement('div');
    popup.style.setProperty('translate', '-5px -5px');
    host.appendChild(popup);
    syncPopupOrigin(popup);
    expect(popup.style.getPropertyValue('translate')).toBe('');

    const spy = vi.spyOn(document, 'createElement');
    const inBody = document.createElement('div');
    spy.mockClear();
    appendToPopupContainer(inBody, null);
    expect(inBody.parentElement).toBe(document.body);
    expect(spy).not.toHaveBeenCalled();
    // 親が無いときは何もしない。
    expect(() => syncPopupOrigin(document.createElement('div'))).not.toThrow();
    expect(() => syncPopupOrigin(null)).not.toThrow();
  });

  it('もう入っていれば動かさない(別の場所なら移す)', () => {
    const root = make('<div id="a"></div><div id="b"></div>');
    const a = root.querySelector<HTMLElement>('#a')!;
    const b = root.querySelector<HTMLElement>('#b')!;
    const popup = document.createElement('div');
    a.appendChild(popup);
    const spy = vi.spyOn(a, 'appendChild');
    appendToPopupContainer(popup, a);
    expect(spy).not.toHaveBeenCalledWith(popup);
    appendToPopupContainer(popup, b);
    expect(popup.parentElement).toBe(b);
  });
});