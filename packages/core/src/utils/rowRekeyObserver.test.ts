// 追加(1.5.0 / Solid 版の速さ): 行の要素の行のキーが書き換わったこと(Solid 版の行の要素の使い回し)の知らせ。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeRowRekeys } from './rowRekeyObserver';

const flushMutations = () => Promise.resolve();

const makeRow = (parent: HTMLElement, key: string) => {
  const row = document.createElement('div');
  row.className = 'ssg-body-row';
  row.setAttribute('data-row-key', key);
  parent.appendChild(row);
  return row;
};

describe('observeRowRekeys', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    container.remove();
  });

  it('行のキーが変わった行の要素だけを 1 回ずつ知らせ、同じ値の書き直し・行き来して戻ったもの・行でない要素は知らせない', async () => {
    const row1 = makeRow(container, 'a');
    const row2 = makeRow(container, 'b');
    const row3 = makeRow(container, 'c');
    const other = document.createElement('div');
    other.setAttribute('data-row-key', 'x');
    container.appendChild(other);
    const onRekey = vi.fn();
    const stop = observeRowRekeys(container, onRekey);
    row1.setAttribute('data-row-key', 'd');
    row1.setAttribute('data-row-key', 'e');
    row2.setAttribute('data-row-key', 'b');
    row3.setAttribute('data-row-key', 'z');
    row3.setAttribute('data-row-key', 'c');
    other.setAttribute('data-row-key', 'y');
    await flushMutations();
    expect(onRekey.mock.calls.map(([row]) => row)).toEqual([row1]);
    stop();
    row2.setAttribute('data-row-key', 'q');
    await flushMutations();
    expect(onRekey).toHaveBeenCalledTimes(1);
  });

  it('展開行のカードの中(入れ子のグリッド)の行は知らせない', async () => {
    const card = document.createElement('div');
    card.setAttribute('data-ssg-detail', '');
    container.appendChild(card);
    const nested = makeRow(card, 'n1');
    const own = makeRow(container, 'o1');
    const onRekey = vi.fn();
    const stop = observeRowRekeys(container, onRekey);
    nested.setAttribute('data-row-key', 'n2');
    own.setAttribute('data-row-key', 'o2');
    await flushMutations();
    expect(onRekey.mock.calls.map(([row]) => row)).toEqual([own]);
    stop();
  });
});
