import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 最小再現のページも本番ビルドで確かめるための設定
const pages = Object.fromEntries(readdirSync(resolve(__dirname, 'min')).filter((f) => f.endsWith('.html')).map((f) => [f.replace('.html', ''), resolve(__dirname, 'min', f)]))
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-min', rollupOptions: { input: pages } },
  preview: { port: 5410, strictPort: true },
})
