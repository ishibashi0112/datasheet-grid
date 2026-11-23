import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// 変更(Solid を対等に): 「はじめる」のページを React / Solid ごとに分けたので、前の URL を新しい URL へ転送する
//   (npm の README・同梱の Skill・CHANGELOG が前の URL を指している)。末尾に .md を付けた Markdown の URL も同じ。
const MOVED = [
  ['/docs/installation', '/docs/react/installation'],
  ['/docs/quick-start', '/docs/react/quick-start'],
  ['/docs/guides/nextjs', '/docs/react/nextjs'],
  ['/docs/solid', '/docs/solid/installation'],
  ['/docs/react', '/docs/react/installation'],
];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return MOVED.flatMap(([source, destination]) => [
      { source, destination, permanent: true },
      { source: `${source}.md`, destination: `${destination}.md`, permanent: true },
    ]);
  },
};

export default withMDX(config);
