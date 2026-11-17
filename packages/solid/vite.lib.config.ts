import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

// 試作の大きさを測るためのライブラリビルド(`spike:build`)。React 版の vite.lib.config.ts と同じく、
//   フレームワーク(solid-js / @solidjs/web)・virtual-core・core を外部化します。
export default defineConfig({
  plugins: [solid()],
  publicDir: false,
  build: {
    lib: {
      entry: { index: resolve(import.meta.dirname, 'src/index.ts') },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: (id) =>
        /^solid-js($|\/)/.test(id) ||
        /^@solidjs\/web($|\/)/.test(id) ||
        /^@tanstack\/virtual-core($|\/)/.test(id) ||
        /^@ishibashi0112\/spreadsheet-grid-core($|\/)/.test(id),
    },
    outDir: resolve(import.meta.dirname, 'dist'),
    target: 'es2023',
    sourcemap: false,
    emptyOutDir: true,
  },
});