import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5401, strictPort: true },
  preview: { port: 5401, strictPort: true },
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        min: 'min/index.html',
        dark: 'min/dark.html',
        num: 'min/num.html',
        rowsel: 'min/rowsel.html',
      },
    },
  },
})
