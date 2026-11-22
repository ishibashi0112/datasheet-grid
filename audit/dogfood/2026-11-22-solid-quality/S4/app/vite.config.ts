import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [solid()],
  server: { port: 5504, strictPort: true },
  preview: { port: 5504, strictPort: true },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    rollupOptions: { input: { save: resolve(import.meta.dirname, 'save.html'), show: resolve(import.meta.dirname, 'show.html'), loading: resolve(import.meta.dirname, 'loading.html') } },
  },
})
