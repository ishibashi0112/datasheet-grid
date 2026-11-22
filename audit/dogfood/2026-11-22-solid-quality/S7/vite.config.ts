import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [solid()],
  server: { port: 5507, strictPort: true },
  preview: { port: 5507, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        fill: resolve(import.meta.dirname, 'min-fill-action.html'),
        replace: resolve(import.meta.dirname, 'rows-replace.html'),
      },
    },
  },
})
