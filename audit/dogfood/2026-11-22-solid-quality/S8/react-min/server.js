// 最小の再現の dev SSR サーバー(PORT 既定 5508)
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
const root = path.dirname(fileURLToPath(import.meta.url))
const server = http.createServer()
const vite = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true, hmr: { server } }, appType: 'custom' })
server.on('request', async (req, res) => {
  await new Promise((r) => vite.middlewares(req, res, r))
  if (res.writableEnded || res.headersSent) return
  try {
    let t = await fs.readFile(path.join(root, 'index.html'), 'utf8')
    t = await vite.transformIndexHtml(req.url, t)
    const entry = await vite.ssrLoadModule(process.env.ENTRY ?? '/src/server.tsx')
    const html = t.replace('<!--app-head-->', entry.hydrationScript?.() ?? '').replace('<!--app-html-->', entry.render(req.url))
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
  } catch (e) { vite.ssrFixStacktrace(e); console.error(e); res.writeHead(500).end(String(e.stack)) }
})
server.listen(Number(process.env.PORT ?? 5508), () => console.log('min ready', process.env.PORT ?? 5508, 'TZ', process.env.TZ))
