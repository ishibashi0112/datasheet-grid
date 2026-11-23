// 相対日付の「今日」を入れた表を、サーバー(UTC+14)とクライアント(UTC-11)で今日が違うときにハイドレーションする(R4-2 / S2-22)。
//   React 版はハイドレーションの食い違いでクライアントで描き直し、クライアントの今日の行になる。Solid 版は以前、クライアントの
//   今日で計算しながらサーバーの要素を使ったので、行と件数がサーバーのまま残り、使われなかった要素の警告が出ていた。今は
//   ハイドレーションする骨組みを両方で行を空として描き(段階 4 の測り直し S8-01)、サーバーの行は写し(段 3-5)にだけ描いて、
//   描き終わった後にクライアントの行へ入れ替える。
import { expect, it } from 'vitest';
import { hydrateFixture, splitServerHtml, stubMatchMedia } from './hydrate';

it('ハイドレーションの後はクライアントの今日の行になり、警告を出さない(R4-2 / S2-22)', async () => {
  stubMatchMedia([]);
  const { container, serverHtml, serverRoot, logs } = await hydrateFixture('relativeDate');
  // サーバーの写しはサーバーの今日(2 行)。
  expect(splitServerHtml(serverHtml).snapshot?.textContent).toContain('行 2 / 4');
  expect(container.querySelector('.ssg-root')).toBe(serverRoot);
  expect(container.textContent).toContain('行 1 / 4');
  expect(container.textContent).not.toContain('行 2 / 4');
  expect(container.querySelectorAll('[data-pane="left"].ssg-body-row')).toHaveLength(1);
  expect(logs).toEqual([]);
});