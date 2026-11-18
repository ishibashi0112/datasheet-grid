import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';

// Solid 版のテスト(ルートの `vp test` には入れません。`pnpm --filter ./packages/solid test`)。
// Solid の JSX 変換はこのパッケージの src だけに掛ける(React 版と並べて比べるテストが React 版のソースを読むため。
// React 版のファイルは既定の React の JSX 変換になる)。
export default defineConfig({
  plugins: [solid({ include: ['src/**/*.{ts,tsx}'] })],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});