import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export function getPageImage(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `${docsImageRoute}/${segments.join('/')}`,
  };
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'content.md'];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join('/')}`,
  };
}

// API リファレンスの先頭の注記(components/api-framework-note.tsx)は、Markdown では文に置き換える
const API_FRAMEWORK_NOTE_TEXT =
  '> このリファレンスは React 版(`@ishibashi0112/spreadsheet-grid`)と Solid 版(`@ishibashi0112/spreadsheet-grid-solid`)で共通です。例のコードは React の書き方です。Solid 版での読み替え(`useState` → `createSignal`、`ref` オブジェクト → `let grid!` と `ref={grid}`、`/lite` は本体の入口 など)は Solid 版の npm に同梱の `API_REFERENCE.md` の先頭と [Solid で気をつけること](/docs/solid/notes.md) にあります。';

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = (await page.data.getText('processed')).replace('<ApiFrameworkNote />', API_FRAMEWORK_NOTE_TEXT);

  return `# ${page.data.title} (${page.url})

${processed}`;
}
