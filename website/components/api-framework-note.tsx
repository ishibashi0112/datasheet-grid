'use client';

// API リファレンスの各ページの先頭の注記(scripts/sync-api-pages.mjs が生成するページに入れる)。
// リファレンスは React 版と Solid 版で共通なので、サイドバーで Solid を選んでいるときは Solid 版での読み替えを出す。
// 中身は Solid 版の npm に同梱する API_REFERENCE.md の先頭の読み替え(packages/solid/scripts/emit-docs.mjs)と同じ。
import Link from 'next/link';
import { Callout } from 'fumadocs-ui/components/callout';
import { useFramework } from '@/lib/framework';

export function ApiFrameworkNote() {
  const framework = useFramework();
  if (framework === 'react') {
    return (
      <Callout title="React 版と Solid 版で共通のリファレンスです">
        props・列の定義・ハンドルのメソッド・通知・CSS のクラスとトークンは両方で同じです。例のコードは React の書き方です。サイドバーの一番上で
        Solid を選ぶと、Solid 版での読み替えをここに出します。
      </Callout>
    );
  }
  return (
    <Callout title="Solid 版(@ishibashi0112/spreadsheet-grid-solid)で読むとき">
      <p>props・列の定義・ハンドルのメソッド・通知・CSS のクラスとトークンは React 版と同じです。例のコードは次のように読み替えてください。</p>
      <ul>
        <li>
          import は <code>@ishibashi0112/spreadsheet-grid-solid</code> から。<code>/lite</code> の <code>createSpreadsheetGrid</code>{' '}
          と機能の部品も本体の入口にあります(<code>/lite</code> はありません)。<code>/ai</code> / <code>/locales/en</code> /{' '}
          <code>/testing</code> は同じ名前です。<code>/ai</code> の <code>useGridAsk</code> は <code>createGridAsk</code>(型の{' '}
          <code>UseGridAskOptions</code> / <code>UseGridAskResult</code> は <code>CreateGridAskOptions</code> /{' '}
          <code>CreateGridAskResult</code>)で、<code>grid</code> はハンドルを返す関数(<code>{'grid={() => grid}'}</code>)か signal です。
        </li>
        <li>
          <code>useState</code> は <code>createSignal</code>(<code>{'rows={rows}'}</code> は <code>{'rows={rows()}'}</code>)、
          <code>useMemo</code> は <code>createMemo</code>、<code>useRef</code> + <code>{'ref={gridRef}'}</code> は{' '}
          <code>{'let grid!: SpreadsheetGridHandle<Row>'}</code> + <code>{'ref={grid}'}</code>(<code>gridRef.current</code> は{' '}
          <code>grid</code>)、<code>flushSync</code> / テストの <code>act()</code> は <code>solid-js</code> の <code>flush()</code> です。
        </li>
        <li>
          型の <code>ReactNode</code> は <code>JSX.Element</code>、<code>useEffect</code> は <code>createEffect</code> /{' '}
          <code>onSettled</code>、<code>Suspense</code> は <code>{'<Loading>'}</code>、<code>createPortal</code> は{' '}
          <code>{'<Portal>'}</code>(<code>@solidjs/web</code>)です。
        </li>
        <li>
          「X.Y.Z から」の版は React 版とコアの版です。Solid 版は 1.4.0 から同じ版なので、1.4.0 以降の「X.Y.Z
          から」は Solid 版でも同じ版から使えます(1.3.0 以前の版の機能は Solid 版 1.4.0 にすべて入っています)。
        </li>
        <li>
          大きさ(KB)は React 版の値です。Solid 版は全部入りで約 168KB、機能なしで約 95KB、<code>standardFeatures</code>{' '}
          で約 123KB です(solid-js は含めない)。
        </li>
        <li>
          Solid 版だけのこと(描く関数を呼び直す時機・書き込みの反映・テスト・SSR)は{' '}
          <Link href="/docs/solid/notes">Solid で気をつけること</Link>と <Link href="/docs/solid/ssr">SSR</Link> にあります。
        </li>
      </ul>
    </Callout>
  );
}