// 主な機能を有効にした表のハイドレーション(警告を出さない)。
import { expect, it } from 'vitest';
import { hydrateFixture, stubMatchMedia } from './hydrate';

it('警告を出さずにサーバーの要素を使う', async () => {
  stubMatchMedia([]);
  const { container, serverRoot, logs } = await hydrateFixture('features');
  expect(logs).toEqual([]);
  expect(container.querySelector('.ssg-root')).toBe(serverRoot);
  expect(container.textContent).toContain('"a" を含む');
});