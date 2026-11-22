import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';
import { CLIENT_TZ } from './timeZones';

// Solid 版の SSR とハイドレーションの確かめ(`pnpm --filter ./packages/solid run test:ssr`。段階 4-5)。
//   サーバーの HTML は globalSetup.ts が子のプロセス(render.mjs。Vite の SSR)で 1 回だけ作り、ここではハイドレーションできる形
//   (ssr: true + hydratable)で変換した部品でそれをハイドレーションする(表 1 つにつきファイル 1 つ = hydrate.<表>.test.tsx)。
//   クライアントのタイムゾーンは CLIENT_TZ(サーバーは表ごとに決める。既定はクライアントと今日が 1 日ずれる SERVER_TZ)。
process.env.TZ = CLIENT_TZ;

export default defineConfig({
  root: new URL('..', import.meta.url).pathname,
  plugins: [
    solid({
      ssr: true,
      refresh: false,
      performanceTracks: false,
      solid: { hydratable: true },
      include: ['src/**/*.{ts,tsx}', 'ssr/**/*.{ts,tsx}'],
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['ssr/**/*.test.{ts,tsx}'],
    globalSetup: ['./ssr/globalSetup.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});