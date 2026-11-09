import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        paste: resolve(import.meta.dirname, 'min/paste.html'),
        reset: resolve(import.meta.dirname, 'min/reset.html'),
        selcount: resolve(import.meta.dirname, 'min/selcount.html'),
        selall: resolve(import.meta.dirname, 'min/selall.html'),
      },
    },
  },
})
