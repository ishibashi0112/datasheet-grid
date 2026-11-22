import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// React 版 1.2.1 で同じテストを回す(比較用)
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'react-jsdom', environment: 'jsdom', setupFiles: ['./react/setup.ts'], include: ['react/**/*.test.tsx'] } },
      { extends: true, test: { name: 'react-happy-dom', environment: 'happy-dom', setupFiles: ['./react/setup.ts'], include: ['react/**/*.test.tsx'] } },
    ],
  },
})
