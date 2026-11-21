// Solid のライブラリの慣例の「solid」条件で渡す、JSX のままの入口(dist/source/index.jsx)を作ります(build:lib の 2 つ目)。
//   利用側の Vite + @solidjs/vite-plugin(と Solid に対応したほかのバンドラ)は「solid」条件でこちらを読み、自分の設定
//   (DOM / SSR・開発ビルド)でコンパイルします。SolidStart などの SSR で動かすには、この形が要ります(コンパイル済みの
//   dist/index.js は DOM 向けなので、サーバーでは読めない)。
//   - esbuild で 1 つのファイルに束ね、型だけを消して JSX は残します(jsx: 'preserve')。束ねるのは、利用側のツールが
//     拡張子の無い相対の import を探さなくて済むようにするためです。
//   - 外部化は vite.lib.config.ts と同じ(solid-js / @solidjs/web / virtual-core / core)。
//   - process.env.NODE_ENV は置き換えません(利用側のバンドラが決める。開発時だけの警告)。
// 実行: cwd はパッケージ直下(packages/solid)。
import { build } from 'esbuild';

await build({
  entryPoints: { index: 'src/index.ts' },
  outdir: 'dist/source',
  outExtension: { '.js': '.jsx' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  jsx: 'preserve',
  minify: false,
  legalComments: 'none',
  external: ['solid-js', 'solid-js/*', '@solidjs/web', '@solidjs/web/*', '@tanstack/virtual-core', '@ishibashi0112/spreadsheet-grid-core', '@ishibashi0112/spreadsheet-grid-core/*'],
  logLevel: 'warning',
});
console.log('build-source: dist/source/index.jsx を作りました');