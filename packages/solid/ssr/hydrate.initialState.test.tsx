// initialState の絞り込みと並べ替えを入れた表のハイドレーション(サーバーと同じ行で、警告を出さない)。
import { expect, it } from 'vitest';
import { hydrateFixture, stubMatchMedia } from './hydrate';

it('警告を出さずにサーバーの要素を使い、絞り込みと並べ替えはそのまま', async () => {
  stubMatchMedia([]);
  const { container, serverRoot, logs } = await hydrateFixture('initialState');
  expect(logs).toEqual([]);
  expect(container.querySelector('.ssg-root')).toBe(serverRoot);
  expect(container.textContent).toContain('行 2 / 4');
  expect(container.textContent).toContain('並び替え: 数量(降順)');
});