import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5412, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5412, strictPort: true, host: '127.0.0.1' },
  // 最小再現のページ(min.html)も本番ビルドに入れる
  build: { rollupOptions: { input: { main: 'index.html', min: 'min.html' } } },
})
