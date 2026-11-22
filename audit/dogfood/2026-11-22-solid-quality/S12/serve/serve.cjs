// 本番ビルドの比較用: /solid/ と /react/ を 5512 で配る
const http = require('http')
const fs = require('fs')
const path = require('path')
const roots = { solid: path.join(__dirname, '../app/dist-solid'), react: path.join(__dirname, '../react/dist-react'), old: path.join(__dirname, '../react-old/dist-old') }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const [, app, ...rest] = u.pathname.split('/')
  const root = roots[app]
  if (!root) { res.writeHead(404); return res.end() }
  let file = path.join(root, rest.join('/') || 'index.html')
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(5512, () => console.log('serving 5512'))
