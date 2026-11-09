import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5405, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5405, strictPort: true, host: '127.0.0.1' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        mixed: resolve(import.meta.dirname, 'mixed.html'),
        modal: resolve(import.meta.dirname, 'repro/mantine-modal.html'),
        date: resolve(import.meta.dirname, 'repro/date-paste.html'),
        custom: resolve(import.meta.dirname, 'repro/custom-outside.html'),
        warn: resolve(import.meta.dirname, 'repro/warn.html'),
      },
    },
  },
})
