// 追加(段階 2 C-N2): 展開行のカードと Tab の順番の DOM の処理(Tab で止まる要素の一覧 / カードの端 / 行のカードの検索)。
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { findDetailCard, focusDetailCardEdge, isTabEdgeOfCard, listTabbableElements } from './detailTabOrder';

afterEach(() => {
  document.body.innerHTML = '';
});

const build = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
};

describe('listTabbableElements', () => {
  it('Tab で止まる要素だけを DOM の順に返す(負の tabindex / 無効 / hidden の input / inert の中 / href の無い a は除く)', () => {
    const host = build(`
      <button id="b1">1</button>
      <button id="b2" disabled>2</button>
      <input id="i1" />
      <input id="i2" type="hidden" />
      <a id="a1">no href</a>
      <a id="a2" href="#">link</a>
      <div id="d1" tabindex="-1">x</div>
      <div id="d2" tabindex="0">y</div>
      <div inert><button id="b3">3</button></div>
      <select id="s1"></select>
      <textarea id="t1"></textarea>
    `);
    // (contenteditable はブラウザでは tabIndex 0 だが、jsdom は -1 を返すのでここでは見ない。)
    expect(listTabbableElements(host).map((el) => el.id)).toEqual(['b1', 'i1', 'a2', 'd2', 's1', 't1']);
  });
});

describe('isTabEdgeOfCard', () => {
  it('後ろ(forward)/ 前(backward)に止まる要素が無ければ端。子孫は後、祖先は前として数える', () => {
    const card = build(`
      <button id="first">a</button>
      <div id="wrap" tabindex="0"><input id="inner" /></div>
      <input id="last" />
    `);
    const get = (id: string) => card.querySelector(`#${id}`) as HTMLElement;
    expect(isTabEdgeOfCard(card, get('first'), 'backward')).toBe(true);
    expect(isTabEdgeOfCard(card, get('first'), 'forward')).toBe(false);
    expect(isTabEdgeOfCard(card, get('last'), 'forward')).toBe(true);
    expect(isTabEdgeOfCard(card, get('last'), 'backward')).toBe(false);
    // wrap の子孫(inner)は wrap の後、wrap は inner の前。
    expect(isTabEdgeOfCard(card, get('wrap'), 'forward')).toBe(false);
    expect(isTabEdgeOfCard(card, get('inner'), 'backward')).toBe(false);
    // 止まる要素ではないもの(カードの中の span)からも判定できる。
    const span = document.createElement('span');
    card.appendChild(span);
    expect(isTabEdgeOfCard(card, span, 'forward')).toBe(true);
    expect(isTabEdgeOfCard(card, span, 'backward')).toBe(false);
  });
});

describe('findDetailCard / focusDetailCardEdge', () => {
  it('その行の中央のペインのカードを返し(左右の帯・入れ子のグリッドのカードは数えない)、最初 / 最後の要素へフォーカスする', () => {
    const scroll = build(`
      <div class="left"><div class="ssg-detail-band" data-detail-row-index="2"></div></div>
      <div class="center">
        <div class="ssg-detail-band" data-detail-row-index="2">
          <div class="ssg-detail-card-holder">
            <div class="ssg-detail-card" data-ssg-detail="" id="card2">
              <button id="c2-first">a</button>
              <div class="ssg-detail-band" data-detail-row-index="5">
                <div data-ssg-detail="" id="nested5"><input /></div>
              </div>
              <input id="c2-last" />
            </div>
          </div>
        </div>
        <div class="ssg-detail-band" data-detail-row-index="3">
          <div class="ssg-detail-card-holder"><div data-ssg-detail="" id="card3"></div></div>
        </div>
      </div>
    `);
    const card2 = findDetailCard(scroll, 2);
    expect(card2?.id).toBe('card2');
    expect(findDetailCard(scroll, 5)).toBeNull();
    expect(findDetailCard(scroll, 4)).toBeNull();
    expect(focusDetailCardEdge(card2!, 'first')).toBe(true);
    expect(document.activeElement?.id).toBe('c2-first');
    expect(focusDetailCardEdge(card2!, 'last')).toBe(true);
    expect(document.activeElement?.id).toBe('c2-last');
    // 止まる要素の無いカード。
    expect(focusDetailCardEdge(findDetailCard(scroll, 3)!, 'first')).toBe(false);
  });
});