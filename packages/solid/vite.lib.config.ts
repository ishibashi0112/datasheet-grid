import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

// Solid 版のライブラリビルド(build:lib の 1 つ目。npm に出す dist の「import」条件 = コンパイル済みの JS)。
//   - React 版の vite.lib.config.ts と同じく、フレームワーク(solid-js / @solidjs/web)・virtual-core・core を外部化します。
//   - JSX は DOM 向けにコンパイルします(Solid の慣例の「solid」条件で JSX のまま渡すものは scripts/build-source.mjs が作る。
//     利用側の Vite + @solidjs/vite-plugin はそちらを読み、SSR / 開発ビルドに合わせて自分でコンパイルする)。
//   - ESM だけです(solid-js 2.0 も ESM だけ)。CSS は React 版と同じファイルを scripts/emit-css.mjs が写します。
export default defineConfig({
  plugins: [solid()],
  publicDir: false,
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        'locales/en': resolve(import.meta.dirname, 'src/locales/en.ts'),
        testing: resolve(import.meta.dirname, 'src/testing/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: (id) =>
        /^solid-js($|\/)/.test(id) ||
        /^@solidjs\/web($|\/)/.test(id) ||
        /^@tanstack\/virtual-core($|\/)/.test(id) ||
        /^@ishibashi0112\/spreadsheet-grid-core($|\/)/.test(id),
      output: { exports: 'named' },
    },
    outDir: resolve(import.meta.dirname, 'dist'),
    target: 'es2023',
    sourcemap: false,
    emptyOutDir: true,
  },
});