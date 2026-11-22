import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [solid()],
  server: { port: 5506, strictPort: true },
  preview: { port: 5506, strictPort: true },
})
