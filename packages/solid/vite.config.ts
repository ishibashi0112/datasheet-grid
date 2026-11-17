import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

// 試作のデモ(`pnpm --filter ./packages/solid dev` / `build:demo`)。
export default defineConfig({
  root: resolve(import.meta.dirname, 'demo'),
  plugins: [solid()],
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist-demo'),
    emptyOutDir: true,
    target: 'es2023',
  },
});