/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5411, strictPort: true },
  preview: { port: 5411, strictPort: true },
  build: { rollupOptions: { input: { main: 'index.html', repro: 'repro.html' } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
