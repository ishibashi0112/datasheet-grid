// 監査ハーネスの Solid 版の Vite 設定です(ゲート対象外。Solid 版のソースを直接 import して実ブラウザで動かします)。
//   React 版(../vite.config.ts。port 5177)と同じテスト(../t-*.mjs)を `HARNESS_BASE=http://127.0.0.1:5179/` で回します。
//   solid-js / @solidjs/web / core はルートの node_modules に無いので、ハーネスのファイルからの import も Solid 版の
//   パッケージ(packages/solid)から解決する(同じ実体を使うため。別の実体になると Solid の状態が 2 つに分かれる)。
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const REPO = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '');
const SOLID_PACKAGE = `${REPO}/packages/solid`;
const SOLID_ENTRY = `${SOLID_PACKAGE}/src/index.ts`;
const { default: solid } = (await import(
  pathToFileURL(`${SOLID_PACKAGE}/node_modules/@solidjs/vite-plugin/dist/esm/index.mjs`).href
)) as { default: (options?: Record<string, unknown>) => Plugin };

const FROM_SOLID_PACKAGE = /^(solid-js|@solidjs\/web|@ishibashi0112\/spreadsheet-grid-core)(\/.*)?$/;
const resolveFromSolidPackage = (): Plugin => ({
  name: 'ssg-harness-resolve-from-solid-package',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!FROM_SOLID_PACKAGE.test(source) || importer === undefined || importer.startsWith(SOLID_PACKAGE)) {
      return null;
    }
    return this.resolve(source, SOLID_ENTRY, { ...options, skipSelf: true });
  },
});

// Solid の Vite プラグインは vite dev で既定で Performance パネルのトラックを入れ、その計測(solid-js/attribution)が
//   描き直しのたびに重くなる(100 万行で遠くへスクロールすると次のフレームまで約 0.5 秒。切ると React 版と同じ約 0.1 秒)。
//   また attribution があると、Solid が「effect が自分の読む値へ書いた」などの知らせを console へ出す。React 版のハーネスと
//   同じ条件で比べるため、既定では切る。SSG_AUDIT_SOLID_TRACKS=1 でプラグインの既定どおり入れる(利用者の開発時と同じ。
//   port 5180 と別の cacheDir なので、既定のサーバーと並べて動かせる。出る知らせは docs/solid/README.md)。
const TRACKS = process.env.SSG_AUDIT_SOLID_TRACKS === '1';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // 依存の事前バンドルの置き場を React 版のハーネスと分ける(同じ node_modules/.vite を使うと、片方が作り直したときに
  //   もう片方の dev サーバーが 504 Outdated Optimize Dep で開けなくなる)。
  cacheDir: `${REPO}/node_modules/.vite-audit-harness-solid${TRACKS ? '-tracks' : ''}`,
  plugins: [resolveFromSolidPackage(), solid(TRACKS ? {} : { performanceTracks: false })],
  resolve: {
    alias: [
      { find: /^@ishibashi0112\/spreadsheet-grid-solid$/, replacement: SOLID_ENTRY },
      // CSS は React 版と同じファイル(Solid 版は DOM と class が同じ)。
      { find: /^@ishibashi0112\/spreadsheet-grid\/style\.css$/, replacement: `${REPO}/packages/react/src/styles.css` },
    ],
  },
  server: {
    port: TRACKS ? 5180 : 5179,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [REPO] },
  },
  logLevel: 'warn',
});