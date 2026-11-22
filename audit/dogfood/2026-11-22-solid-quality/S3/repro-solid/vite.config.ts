import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
export default defineConfig({ plugins: [solid()], server: { port: 5503, strictPort: true, host: '127.0.0.1' }, preview: { port: 5503, strictPort: true, host: '127.0.0.1' } })
