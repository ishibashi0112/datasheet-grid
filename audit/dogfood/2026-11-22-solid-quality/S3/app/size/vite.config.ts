import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
const entry = process.env.ENTRY!
export default defineConfig({
  root: __dirname,
  plugins: [solid()],
  build: { outDir: `dist-${entry}`, emptyOutDir: true, rollupOptions: { input: `${__dirname}/${entry}.html` } },
})
