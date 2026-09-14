import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig } from 'vite'

// core パッケージのライブラリビルド設定です(npm 配布物 dist を生成)。
//   - React 版 / Solid 版はモジュール単位のサブパス(`@ishibashi0112/spreadsheet-grid-core/logic/filtering` 等)で
//     import するため、src 配下の全モジュール(テスト除く)をエントリにし、preserveModules でディレクトリ構造を
//     保ったまま es / cjs を出力します(exports の "./*" がそのまま dist へ対応)。
//   - 依存はありません(純 TS + DOM API)。d.ts は tsc -p tsconfig.lib.json が同じ構造で出力します。
const srcDir = resolve(import.meta.dirname, 'src')

const collectEntries = (dir: string, entries: Record<string, string>) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      collectEntries(full, entries)
      continue
    }
    if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) {
      continue
    }
    entries[relative(srcDir, full).replace(/\.ts$/, '')] = full
  }
  return entries
}

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: collectEntries(srcDir, {}),
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      output: {
        exports: 'named',
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
    target: 'es2023',
    sourcemap: false,
    emptyOutDir: true,
  },
})