// 追加(ドキュメントの整備 2026-11-15): ドキュメントサイトの API リファレンス(website/content/docs/api/*.mdx)が
//   API_REFERENCE.md から生成したものと同じであることを検査します。サイトのページは
//   scripts/sync-api-pages.mjs が正本の節を割り当てどおりに並べて作ります。失敗したら:
//   - errors(節の割り当ての過不足): 正本に ## 節を足したら scripts/sync-api-pages.mjs の PAGES に割り当てる。
//   - ページのずれ: サイトのページは手で直さず、API_REFERENCE.md を直して `pnpm run docs:api` で再生成する。
import { describe, expect, it } from 'vitest';
import reference from '../API_REFERENCE.md?raw';
import apiMeta from '../../../website/content/docs/api/meta.json?raw';
import { buildApiPages, PAGES, SITE_DOCS_URL } from '../../../scripts/sync-api-pages.mjs';

const sitePages = import.meta.glob<string>('../../../website/content/docs/api/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

describe('サイトの API リファレンス(API_REFERENCE.md から生成)', () => {
  const { pages, errors } = buildApiPages(reference);

  it('正本の ## 節はどれもサイトのページに 1 回ずつ割り当てられている', () => {
    expect(errors).toEqual([]);
  });

  it('サイトの API のページは割り当てどおり(余分なページも無い)', () => {
    expect(Object.keys(sitePages).map(fileName).sort()).toEqual(PAGES.map((p) => p.file).sort());
    const meta = JSON.parse(apiMeta) as { pages: string[] };
    expect(meta.pages).toEqual(PAGES.map((p) => p.file.replace(/\.mdx$/, '')));
  });

  it.each(PAGES.map((p) => p.file))('%s は API_REFERENCE.md と同期している(ずれたら pnpm run docs:api)', (file) => {
    const site = Object.entries(sitePages).find(([path]) => fileName(path) === file)?.[1];
    expect(site).toBe(pages[file]);
  });

  it('正本の行はすべてサイトのどこかのページにある(題と前書きを除く)', () => {
    const siteLines = new Set(Object.values(pages).flatMap((page) => page.split('\n')));
    const body = reference.slice(reference.indexOf('\n## ') + 1);
    const missing = body
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.split(SITE_DOCS_URL).join('/docs/'))
      .filter((line) => !siteLines.has(line));
    expect(missing).toEqual([]);
  });

  it('サイトのページでは正本のサイトへの絶対 URL を相対パスにする', () => {
    expect(reference).toContain(`](${SITE_DOCS_URL}guides/`);
    for (const page of Object.values(pages)) expect(page).not.toContain(SITE_DOCS_URL);
  });
});