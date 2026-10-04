// 監査ハーネス用の Vite 設定です(ゲート対象外。ライブラリのソースを直接 import して Chromium で動かします)。
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@ishibashi0112\/spreadsheet-grid$/, replacement: `${REPO}/packages/react/src/index.ts` },
      { find: /^@ishibashi0112\/spreadsheet-grid\/style\.css$/, replacement: `${REPO}/packages/react/src/styles.css` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5177,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [REPO] },
  },
  logLevel: 'warn',
});