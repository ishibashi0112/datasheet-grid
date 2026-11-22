import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
// 回避策の確認: SSR のビルドでも process.env.NODE_ENV を置き換える
export default defineConfig(({ command }) => ({
  plugins: [solid({ ssr: true })],
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
}))
