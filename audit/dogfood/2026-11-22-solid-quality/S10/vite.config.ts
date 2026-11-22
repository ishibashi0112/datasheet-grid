import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solid()],
  server: { port: 5510, strictPort: true },
  preview: { port: 5510, strictPort: true },
})
