import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';

// 試作のテスト(ルートの `vp test` には入れません。`pnpm --filter ./packages/solid test`)。
export default defineConfig({
  plugins: [solid()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});