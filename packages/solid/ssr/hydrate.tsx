// ハイドレーションのテストの共通の手順。Solid はページで 1 回のハイドレーションを前提にする(2 回目の hydrate() は
//   サーバーの要素を使わずに描き直す)ので、表 1 つにつきテストのファイルを 1 つにする(ファイルごとにモジュールを読み直す)。
import { afterEach, beforeAll, inject, vi } from 'vitest';
import { flush } from 'solid-js';
import { hydrate } from '@solidjs/web';
import { fixtures } from './fixtures';
import { FIXED_NOW } from './timeZones';

export const serverOutput = () => inject('ssrServerOutput');

const cleanups: Array<() => void> = [];

beforeAll(() => {
  // ハイドレーションの台本(generateHydrationScript の中身)を走らせる。
  for (const match of serverOutput().script.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    new Function(match[1] ?? '')();
  }
  // 列の幅を文字から測る部品(autoSizeColumns)が jsdom の未実装の canvas を呼んで出す表示を止める。
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// OS の設定(matchMedia)を決める。matching に含む文字列を含む問い合わせだけが当てはまる。
export function stubMatchMedia(matching: readonly string[]): void {
  window.matchMedia = ((query: string) => ({
    matches: matching.some((part) => query.includes(part)),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

export function textOf(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element.textContent ?? '';
}

// サーバーの HTML をページへ置き、同じ表をハイドレーションする。描く時刻は FIXED_NOW(タイムゾーンはクライアントのもの)。
//   ハイドレーションの間と直後の console.error / console.warn(Solid の「使われなかったサーバーの要素」の警告を含む)を返す。
export async function hydrateFixture(
  name: string,
): Promise<{ container: HTMLElement; serverHtml: string; serverRoot: Element | null; logs: string[] }> {
  const Fixture = fixtures[name];
  const serverHtml = serverOutput().pages[name];
  if (!Fixture || serverHtml === undefined) {
    throw new Error(`表がありません: ${name}`);
  }
  vi.useFakeTimers({ toFake: ['Date'], now: FIXED_NOW });
  const logs: string[] = [];
  const record = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  vi.spyOn(console, 'error').mockImplementation(record);
  vi.spyOn(console, 'warn').mockImplementation(record);
  const container = document.createElement('div');
  container.innerHTML = serverHtml;
  document.body.append(container);
  const serverRoot = container.querySelector('.ssg-root');
  const dispose = hydrate(() => <Fixture />, container, { renderId: name });
  cleanups.push(() => {
    dispose();
    container.remove();
  });
  flush();
  await sleep(50);
  flush();
  return { container, serverHtml, serverRoot, logs };
}