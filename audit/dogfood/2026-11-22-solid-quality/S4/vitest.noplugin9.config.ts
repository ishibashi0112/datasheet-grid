import { defineConfig } from 'vitest/config'
export default defineConfig({ resolve: { conditions: ['browser'] }, ssr: { resolve: { conditions: ['browser'], externalConditions: ['browser'] } }, test: { environment: 'jsdom', include: ['noplugin/*.test.ts'] } })
