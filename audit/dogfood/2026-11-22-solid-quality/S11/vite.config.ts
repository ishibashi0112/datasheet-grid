import solid from '@solidjs/vite-plugin'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solid()],
  build: {
    rolldownOptions: {
      input: { main: resolve(__dirname, 'index.html'), frame: resolve(__dirname, 'frame.html'), portal: resolve(__dirname, 'portal.html'), min: resolve(__dirname, 'min/index.html') },
    },
  },
})
