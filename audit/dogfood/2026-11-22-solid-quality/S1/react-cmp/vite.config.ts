import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'

const pages = Object.fromEntries(readdirSync(import.meta.dirname).filter((f) => f.endsWith('.html')).map((f) => [f.replace('.html', ''), resolve(import.meta.dirname, f)]))
export default defineConfig({
  plugins: [react()],
  server: { port: 5504, strictPort: true },
  preview: { port: 5504, strictPort: true },
  build: { rollupOptions: { input: pages } },
})
