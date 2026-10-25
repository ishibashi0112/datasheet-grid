import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Rollup } from 'vite'
import libConfig from './vite.lib.config'

type OutputOptions = Rollup.OutputOptions

// 追加(差し込み式 段階 6): /lite の入口(dist/lite.js と dist/lite/ 以下)のビルド設定です。build:lib で
//   vite.lib.config.ts(全部入りの index と testing)の後に、同じ dist へ書き足します。
//   - 機能ごとのファイル(src/features/<名前>)をそれぞれエントリにします。機能ごとに別のチャンクになるので、
//     利用側のバンドラは使わない機能のチャンクをまるごと読まずに済みます。1 つの共有チャンクに全機能を入れると、
//     Turbopack(Next.js 16 の既定)と webpack はチャンクの中の使わない機能を取り除けませんでした(2026-10-25 に
//     計測。Turbopack は機能なしでも全部入りと同じ大きさ)。入口の dist/lite.js は再エクスポートだけにします
//     (createSpreadsheetGrid と本体もエントリにして別のファイルへ出す)。Turbopack は読み込んだモジュールの import を
//     すべて残すので、入口に中身があると入口が再エクスポートする全機能が残るためです。プリセット(standardFeatures)
//     も同じ理由で自分のファイル(features/standard)に置きます。
//   - 全部入りとはチャンクを共有しません。全部入りまで機能ごとに分けると、利用側で束ねたときの並び順が変わって
//     フル版の gzip が増えるためです(esbuild で約 1.8KB / Vite で約 1.6KB)。そのため同じアプリで全部入りと
//     /lite を混ぜると共通部分が二重に入ります(文書でどちらかに揃えるよう案内)。preserveModules
//     (モジュールごとのファイル)は試したうえで使いません(全部入りでは同じく並び順で gzip が 2〜3KB 増え、
//     /lite では Turbopack でも機能ごとのチャンクと同じ大きさだったため)。
//   - CSS は全部入りのビルドが書く dist/style.css と同じものなので、こちらでは書き出しません。
const FEATURE_NON_ENTRIES = new Set(['full', 'resolve', 'types'])
const featureEntries = Object.fromEntries(
  readdirSync(resolve(import.meta.dirname, 'src/features'))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => file.replace(/\.tsx?$/, ''))
    .filter((name) => !FEATURE_NON_ENTRIES.has(name))
    .map((name) => [`features/${name}`, resolve(import.meta.dirname, `src/features/${name}`)]),
)

const baseRollupOptions = libConfig.build?.rollupOptions ?? {}
const baseOutput = (baseRollupOptions.output ?? {}) as OutputOptions

export default defineConfig({
  ...libConfig,
  plugins: [
    ...(libConfig.plugins ?? []),
    {
      name: 'ssg-lite-drop-css',
      generateBundle(_options, bundle) {
        for (const fileName of Object.keys(bundle)) {
          if (fileName.endsWith('.css')) delete bundle[fileName]
        }
      },
    },
  ],
  build: {
    ...libConfig.build,
    lib: {
      entry: {
        lite: resolve(import.meta.dirname, 'src/lite.ts'),
        createSpreadsheetGrid: resolve(import.meta.dirname, 'src/createSpreadsheetGrid.tsx'),
        ...featureEntries,
      },
      fileName: (format, entryName) =>
        `${entryName === 'lite' ? 'lite' : `lite/${entryName}`}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      ...baseRollupOptions,
      // 共有チャンクも dist/lite/ に置きます(全部入りのチャンクと混ざらないように)。形式ごとに拡張子を変えるため
      //   出力を配列で渡します(lib.formats の代わり)。
      output: (['es', 'cjs'] as const).map((format) => ({
        ...baseOutput,
        format,
        chunkFileNames: `lite/[name]-[hash].${format === 'es' ? 'js' : 'cjs'}`,
      })),
    },
    emptyOutDir: false,
  },
})