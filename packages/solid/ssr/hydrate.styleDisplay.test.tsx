// 利用者が style の display で隠したグリッド(段 3-9 のレビュー)。サーバーは骨組みを display: none + hidden で隠し、写しを
//   後ろに置く。ハイドレーションの後に写しを外すとき、利用者の display(ここでは none)へ戻す。これまでは display を消して
//   いたので、隠したはずのグリッドが見え、利用者が値を変えるまで戻らなかった(Solid のハイドレーションは style を書かず、
//   その後の描画も前と同じ値なら書き直さない)。
import { expect, it } from 'vitest';
import { flush } from 'solid-js';
import { hydrateFixture, splitServerHtml } from './hydrate';

it('ハイドレーションの後も利用者の display を保ち、切り替えも効く', async () => {
  const { container, serverHtml, serverRoot, logs } = await hydrateFixture('styleDisplay', 'none');
  // サーバーの骨組みは hidden 付きで隠す(兄弟を :not([hidden]) で数える CSS が写しを 2 つめの子と数えない)。
  const { frame } = splitServerHtml(serverHtml);
  expect(frame?.hasAttribute('hidden')).toBe(true);
  expect(frame?.style.display).toBe('none');
  expect(logs).toEqual([]);
  const root = container.querySelector<HTMLElement>('.ssg-root');
  expect(root).toBe(serverRoot);
  const setHidden = (globalThis as { __setStyleDisplayHidden?: (value: boolean) => void }).__setStyleDisplayHidden;
  setHidden?.(false);
  flush();
  expect(root?.style.display).toBe('');
  setHidden?.(true);
  flush();
  expect(root?.style.display).toBe('none');
});
