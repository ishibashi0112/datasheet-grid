import { defineConfig } from 'vitest/config'
// README のとおり browser の条件で解決する(プラグインなし)
export default defineConfig({ resolve: { conditions: ['browser'] }, test: { environment: 'jsdom', include: ['noplugin/*.test.ts'] } })
