// dev: Vite の middlewareMode / prod(PROD=1): dist を配る。ポート 5502
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
const prod = !!process.env.PROD
const server = http.createServer()
let vite
if (!prod) vite = await (await import('vite')).createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' })
server.on('request', async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const page = async () => {
    let tpl, render
    if (prod) { tpl = await fs.readFile(path.join(root, 'dist/client/index.html'), 'utf8'); render = (await import('./dist/server/entry-server.js')).render }
    else { tpl = await vite.transformIndexHtml(url.pathname, await fs.readFile(path.join(root, 'index.html'), 'utf8')); render = (await vite.ssrLoadModule('/entry-server.tsx')).render }
    const { html, head } = render(req.url)
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(tpl.replace('<!--head-->', head).replace('<!--html-->', html))
  }
  if (url.pathname === '/' ) return page()
  if (prod) {
    try { const f = path.join(root, 'dist/client', url.pathname); const b = await fs.readFile(f); res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); return res.end(b) } catch { res.writeHead(404); return res.end() }
  }
  vite.middlewares(req, res, () => page())
})
server.listen(5502, () => console.log('listening 5502', prod ? 'prod' : 'dev', process.env.TZ))
