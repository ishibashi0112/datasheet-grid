import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// サイズ計測用: SIZE_ENTRY のページだけをビルドする
const entry = process.env.SIZE_ENTRY ?? 'full'
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: `dist-size/${entry}`,
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: `size/${entry}.html` },
  },
})
