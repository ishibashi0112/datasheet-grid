// 相対日付の「今日」を入れた表を、サーバー(UTC+14)とクライアント(UTC-11)で今日が違うときにハイドレーションする(R4-2)。
//   React 版はハイドレーションの食い違いでクライアントで描き直し、クライアントの今日の行になる。Solid 版はクライアントの今日で
//   計算しながらサーバーの要素を使うので、行と件数がサーバーのまま残り、使われなかった要素の警告が出る。
//   直すには、ハイドレーションの間はサーバーの基準日で絞り込み、その後にクライアントの今日へ切り替える(core の列フィルターの
//   段階へ基準日を渡す口が要るので、段 2 で core と一緒に直す)。直したら it.fails を it に戻す。
import { expect, it } from 'vitest';
import { hydrateFixture, stubMatchMedia, textOf } from './hydrate';

it.fails('ハイドレーションの後はクライアントの今日の行になり、警告を出さない(R4-2。段 2 で直す)', async () => {
  stubMatchMedia([]);
  const { container, serverHtml, serverRoot, logs } = await hydrateFixture('relativeDate');
  expect(textOf(serverHtml)).toContain('行 2 / 4');
  expect(container.querySelector('.ssg-root')).toBe(serverRoot);
  expect(container.textContent).toContain('行 1 / 4');
  expect(container.textContent).not.toContain('行 2 / 4');
  expect(logs).toEqual([]);
});