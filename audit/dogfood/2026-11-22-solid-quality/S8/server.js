// 自前の Node サーバー: dev は Vite のミドルウェア、本番は dist の静的ファイルと SSR の束。
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 3508)
const defaultMode = process.env.SSR_MODE === 'string' ? 'string' : 'stream'

const server = http.createServer()
let vite
let prodTemplate
let prodEntry
if (!isProd) {
  const { createServer } = await import('vite')
  vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' })
} else {
  prodTemplate = await fs.readFile(path.join(root, 'dist/client/index.html'), 'utf8')
  prodEntry = await import(path.join(root, 'dist/server/entry-server.js'))
}

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.html': 'text/html' }

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/assets/')) return false
  const file = path.join(root, 'dist/client', url.pathname)
  try {
    const body = await fs.readFile(file)
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
    res.end(body)
    return true
  } catch {
    return false
  }
}

async function handlePage(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`)
  const mode = url.searchParams.get('_ssr') === 'string' ? 'string' : url.searchParams.get('_ssr') === 'stream' ? 'stream' : defaultMode
  let template
  let entry
  if (!isProd) {
    template = await fs.readFile(path.join(root, 'index.html'), 'utf8')
    template = await vite.transformIndexHtml(req.url, template)
    entry = await vite.ssrLoadModule('/src/entry-server.tsx')
  } else {
    template = prodTemplate
    entry = prodEntry
  }
  const [head, tail] = template.replace('<!--app-head-->', entry.hydrationScript()).split('<!--app-html-->')
  const request = new Request(url, { method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') })
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-ssr-mode': mode })
  res.write(head)
  await entry.render(request, mode, {
    write: (chunk) => res.write(chunk),
    end: () => res.end(tail),
  })
}

server.on('request', (req, res) => {
  const run = async () => {
    if (isProd && (await serveStatic(req, res))) return
    if (vite) {
      await new Promise((resolve) => vite.middlewares(req, res, resolve))
      if (res.writableEnded || res.headersSent) return
    }
    if (req.url?.startsWith('/favicon')) {
      res.writeHead(404).end()
      return
    }
    await handlePage(req, res)
  }
  run().catch((error) => {
    vite?.ssrFixStacktrace(error)
    console.error(error)
    if (!res.headersSent) res.writeHead(500)
    res.end(String(error?.stack ?? error))
  })
})

server.listen(port, () => console.log(`[S8] ${isProd ? 'production' : 'dev'} SSR (${defaultMode}) http://localhost:${port} TZ=${process.env.TZ ?? '(system)'}`))
