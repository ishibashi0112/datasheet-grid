import { createElement as h, version } from 'react'
import { renderToReadableStream } from 'react-dom/server.browser'
import { App } from '../src/ssrFixture.mjs'
const warnings = []
console.error = (...a) => warnings.push(a.map(String).join(' '))
for (const v of ['plain', 'totalRow', 'find']) {
  const stream = await renderToReadableStream(h(App, { variant: v }))
  await stream.allReady
  await new Response(stream).text()
}
process.stdout.write(JSON.stringify({ version, warnings }) + '\n')
