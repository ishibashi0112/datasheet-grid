// 5506 番 1 つで: /react/ = React 版の本番ビルド、/solid/ = Solid 版の本番ビルド、それ以外 = Solid 版の開発サーバー
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
const here = path.dirname(new URL(import.meta.url).pathname)
const dists = { '/react/': path.join(here, '../react/dist'), '/solid/': path.join(here, 'dist') }
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }
const server = http.createServer()
const vite = await createServer({ root: here, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
server.on('request', (req, res) => {
  const u = new URL(req.url, 'http://x')
  for (const [pre, dir] of Object.entries(dists)) {
    if (u.pathname.startsWith(pre)) {
      let f = path.join(dir, u.pathname.slice(pre.length))
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html')
      res.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream')
      return fs.createReadStream(f).pipe(res)
    }
  }
  vite.middlewares(req, res)
})
server.listen(5506, () => console.log('listening 5506'))
