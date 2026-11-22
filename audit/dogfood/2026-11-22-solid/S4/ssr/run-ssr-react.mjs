import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'warn' })
try {
  const html = (await server.ssrLoadModule('/ssr/entry-server-react.tsx')).renderGrid()
  fs.writeFileSync(new URL('./out-react.html', import.meta.url), html)
  console.log('react length', html.length, 'center rows', (html.match(/data-pane="center"/g) || []).length, 'cell values', (html.match(/ssg-cell-value[^>]*>([^<]*)</g) || []).length, 'has 品目1', html.includes('品目1'))
} catch (e) { console.log('ERR', e.stack.split('\n').slice(0, 6).join('\n')) } finally { await server.close() }
