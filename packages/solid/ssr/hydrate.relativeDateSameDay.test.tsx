// 相対日付の「今日」を入れた表を、サーバーとクライアントで今日が同じときにハイドレーションする(警告を出さない)。
import { expect, it } from 'vitest';
import { hydrateFixture, stubMatchMedia, textOf } from './hydrate';

it('警告を出さずにサーバーの要素を使い、今日の行だけ', async () => {
  stubMatchMedia([]);
  const { container, serverHtml, serverRoot, logs } = await hydrateFixture('relativeDateSameDay');
  // サーバーは件数を描かない(S8-01)。
  expect(textOf(serverHtml)).not.toContain('行 1 / 4');
  expect(logs).toEqual([]);
  expect(container.querySelector('.ssg-root')).toBe(serverRoot);
  expect(container.textContent).toContain('行 1 / 4');
});