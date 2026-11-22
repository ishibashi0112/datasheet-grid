// SSR の Node サーバー(dev は Vite の middlewareMode、本番は dist を配る)
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './api/users.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production' || !!process.env.PROD
const PORT = Number(process.env.PORT ?? 3501)

const server = http.createServer()
let vite
if (!isProd) {
  const { createServer } = await import('vite')
  vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  })
}

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' }

async function serveStatic(req, res, url) {
  const file = path.join(root, 'dist/client', decodeURIComponent(url.pathname))
  if (!file.startsWith(path.join(root, 'dist/client'))) return false
  try {
    const st = await fs.stat(file)
    if (!st.isFile()) return false
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' })
    res.end(await fs.readFile(file))
    return true
  } catch {
    return false
  }
}

async function renderPage(req, res, url) {
  let template, render
  if (!isProd) {
    template = await fs.readFile(path.join(root, 'index.html'), 'utf8')
    template = await vite.transformIndexHtml(url.pathname + url.search, template)
    render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render
  } else {
    template = await fs.readFile(path.join(root, 'dist/client/index.html'), 'utf8')
    render = (await import('./dist/server/entry-server.js')).render
  }
  const request = new Request(new URL(url.pathname + url.search, `http://${req.headers.host}`), { headers: req.headers })
  const { html, head } = await render(request)
  const out = template.replace('<!--app-head-->', head).replace('<!--app-html-->', html)
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(out)
}

server.on('request', async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    if (isProd) {
      if (url.pathname !== '/' && (await serveStatic(req, res, url))) return
      return await renderPage(req, res, url)
    }
    vite.middlewares(req, res, async () => {
      try {
        await renderPage(req, res, url)
      } catch (e) {
        vite.ssrFixStacktrace(e)
        console.error(e)
        res.writeHead(500)
        res.end(String(e.stack))
      }
    })
  } catch (e) {
    console.error(e)
    res.writeHead(500)
    res.end(String(e.stack))
  }
})
server.listen(PORT, () => console.log(`listening http://localhost:${PORT} (${isProd ? 'prod' : 'dev'})`))
