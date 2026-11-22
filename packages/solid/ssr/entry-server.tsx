// サーバーで fixtures の表を 1 つ描く(render.mjs が Vite の SSR で読み込む)。
import type { renderToString as RenderToString } from '@solidjs/web';
import { fixtures } from './fixtures';

export function renderOne(name: string, renderToString: typeof RenderToString): string {
  const Fixture = fixtures[name];
  if (!Fixture) {
    throw new Error(`表がありません: ${name}`);
  }
  return renderToString(() => <Fixture />, { renderId: name });
}