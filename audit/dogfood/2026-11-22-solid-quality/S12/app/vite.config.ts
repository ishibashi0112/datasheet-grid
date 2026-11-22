import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [solid()],
})
