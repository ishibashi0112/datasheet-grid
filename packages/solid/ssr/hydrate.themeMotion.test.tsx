// theme="auto" と motion の既定の auto(R4-1)。サーバーは OS の設定を知らないのでライト・動きあり で描き、ハイドレーションの後に
//   OS の設定(ダーク / 視差効果を減らす)へ合わせる(React 版の useSyncExternalStore の getServerSnapshot と同じ)。
import { expect, it } from 'vitest';
import { hydrateFixture, stubMatchMedia } from './hydrate';

it('ハイドレーションの後に OS の設定(ダーク / 視差効果を減らす)へ合う', async () => {
  stubMatchMedia(['prefers-color-scheme: dark', 'prefers-reduced-motion: reduce']);
  const { container, serverHtml, serverRoot, logs } = await hydrateFixture('themeMotion');
  expect(serverHtml).not.toContain('ssg-theme-dark');
  expect(serverHtml).not.toContain('ssg-motion-off');
  expect(logs).toEqual([]);
  const root = container.querySelector('.ssg-root');
  // 作り直さずにサーバーの要素を使う(描き直したのなら、それは確かめたいハイドレーションではない)。
  expect(root).toBe(serverRoot);
  expect(root?.classList.contains('ssg-theme-dark')).toBe(true);
  expect(root?.classList.contains('ssg-motion-off')).toBe(true);
});