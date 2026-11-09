import { createElement as h, Suspense, version } from 'react'
import { renderToPipeableStream, renderToReadableStream } from 'react-dom/server'
import { Writable } from 'node:stream'
import { App } from '../src/ssrFixture.mjs'
const warnings = []
console.error = (...a) => warnings.push(a.map(String).join(' '))
console.warn = (...a) => warnings.push(a.map(String).join(' '))
const res = {}
await new Promise((resolve, reject) => {
  let html = ''
  const { pipe } = renderToPipeableStream(h(Suspense, { fallback: 'loading' }, h(App, { variant: 'totalRow' })), {
    onAllReady() { pipe(new Writable({ write(c, _e, cb) { html += c; cb() }, final(cb) { res.pipeable = { len: html.length, rows: (html.match(/ssg-body-row/g) || []).length }; cb(); resolve() } })) },
    onError(e) { reject(e) },
  })
})
const stream = await renderToReadableStream(h(App, { variant: 'find' }))
await stream.allReady
const text = await new Response(stream).text()
res.readable = { len: text.length, rows: (text.match(/ssg-body-row/g) || []).length }
if (version.startsWith('19')) {
  const { prerenderToNodeStream } = await import('react-dom/static')
  const { prelude } = await prerenderToNodeStream(h(App, { variant: 'plain' }))
  let s = ''
  for await (const c of prelude) s += c
  res.prerender = { len: s.length, rows: (s.match(/ssg-body-row/g) || []).length }
}
process.stdout.write(JSON.stringify({ version, res, warnings }) + '\n')
