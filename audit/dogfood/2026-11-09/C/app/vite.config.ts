import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5403, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5403, strictPort: true, host: '127.0.0.1' },
})
