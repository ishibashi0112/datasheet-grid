import solid from '@solidjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: { port: 5501, strictPort: true },
  preview: { port: 5501, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        minStore: resolve(import.meta.dirname, 'min-store.html'),
        minLeak: resolve(import.meta.dirname, 'min-leak.html'),
        minPaste: resolve(import.meta.dirname, 'min-paste.html'),
      },
    },
  },
})
