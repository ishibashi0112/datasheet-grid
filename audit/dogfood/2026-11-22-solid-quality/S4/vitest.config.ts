import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [solid()],
  test: {
    projects: [
      { extends: true, test: { name: 'jsdom', environment: 'jsdom', setupFiles: ['./src/setup.ts'], include: ['src/**/*.test.tsx'] } },
      { extends: true, test: { name: 'happy-dom', environment: 'happy-dom', setupFiles: ['./src/setup.ts'], include: ['src/**/*.test.tsx'] } },
    ],
  },
})
