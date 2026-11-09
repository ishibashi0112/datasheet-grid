import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  server: { port: 5407, strictPort: true },
  preview: { port: 5407, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        drift: resolve(import.meta.dirname, 'repro-drift.html'),
        global: resolve(import.meta.dirname, 'repro-global.html'),
        append: resolve(import.meta.dirname, 'repro-append.html'),
        custom: resolve(import.meta.dirname, 'repro-custom.html'),
      },
    },
  },
})
