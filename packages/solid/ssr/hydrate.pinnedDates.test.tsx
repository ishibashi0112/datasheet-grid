// 固定列 + Date の値の列に日付の範囲の条件を入れた表を、サーバー(東京)とクライアント(UTC-11)でタイムゾーンが違うときに
//   ハイドレーションする(段階 4 の測り直し S8-01)。以前は固定列にサーバーの行の文字が残り、そのセルの編集が別の行に入った。
import { expect, it } from 'vitest';
import { hydrateFixture, stubMatchMedia, textOf } from './hydrate';

it('固定列はクライアントで絞り込んだ行を出し、警告を出さない(S8-01)', async () => {
  stubMatchMedia([]);
  const { container, serverHtml, serverRoot, logs } = await hydrateFixture('pinnedDates');
  // サーバーは行を描かない。
  expect(textOf(serverHtml)).not.toContain('行1');
  expect(textOf(serverHtml)).not.toContain('行3');
  expect(container.querySelector('.ssg-root')).toBe(serverRoot);
  const labels = Array.from(
    container.querySelectorAll('[data-pane="left"].ssg-body-row [data-ssg-col-key="label"]'),
    (cell) => cell.textContent,
  );
  expect(labels).toEqual(['行2', '行4']);
  expect(container.textContent).toContain('行 2 / 5');
  expect(logs).toEqual([]);
});