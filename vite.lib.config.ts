import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SpreadsheetGrid のライブラリビルド設定です(npm 配布物 dist を生成)。
//   - デモ app 用の vite.config.ts とは分離します。デモは `npm run dev` / `npm run build:demo`。
//   - entry は公開バレル index.ts。react / react-dom / @tanstack/react-virtual はバンドルせず
//     外部化し、利用側(peer / 依存)が解決します。サブパス import も正規表現で除外します。
//   - styles.css は JS から分離して単一の dist/style.css へ抽出します(自動注入はしません)。
//     利用側は `import '<pkg>/style.css'` で読み込みます(@layer ssg-base の上書き設計と整合)。
export default defineConfig({
  plugins: [react()],
  // public/ はデモ専用資産(favicon / icons)。ライブラリ配布物には含めません。
  publicDir: false,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/components/spreadsheet-grid/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // react 系と react-virtual を外部化(サブパス import も含めて除外)。
      external: (id) =>
        /^react($|\/)/.test(id) ||
        /^react-dom($|\/)/.test(id) ||
        /^@tanstack\/react-virtual($|\/)/.test(id),
      output: {
        // 公開バレルは named export のみ。
        exports: 'named',
        // 抽出した CSS は dist/style.css に固定(利用側 import パスを安定させる)。
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : [])
          if (names.some((n) => n.endsWith('.css'))) return 'style.css'
          return 'assets/[name][extname]'
        },
      },
    },
    target: 'es2023',
    sourcemap: true,
    cssCodeSplit: false,
    emptyOutDir: true,
  },
})