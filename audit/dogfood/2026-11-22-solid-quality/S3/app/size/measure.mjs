// dist-<entry> の初期読み込み JS(HTML から辿れる static import)の gzip を測る
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'
const dir = process.argv[2]
const html = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.html'))), 'utf8')
const start = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1])
const seen = new Set(); const queue = [...start]
while (queue.length) {
  const f = queue.shift(); if (seen.has(f)) continue; seen.add(f)
  const code = fs.readFileSync(path.join(dir, f), 'utf8')
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) queue.push('assets/' + m[1])
}
let raw = 0, gz = 0
for (const f of seen) { const b = fs.readFileSync(path.join(dir, f)); raw += b.length; gz += zlib.gzipSync(b, { level: 9 }).length }
const all = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.js'))
let lazy = 0; for (const f of all) if (!seen.has('assets/' + f)) lazy += zlib.gzipSync(fs.readFileSync(path.join(dir, 'assets', f)), { level: 9 }).length
console.log(`${path.basename(dir)}: initial ${seen.size} files raw ${(raw / 1024).toFixed(1)}KB gzip ${(gz / 1024).toFixed(2)}KB; lazy-only gzip ${(lazy / 1024).toFixed(2)}KB`)
