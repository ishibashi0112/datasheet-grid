import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { App, variants } from '../src/ssrFixture.mjs'
const out = {}
const warnings = []
console.error = (...a) => warnings.push(a.map(String).join(' '))
for (const v of Object.keys(variants)) out[v] = renderToString(h(App, { variant: v }))
writeFileSync(new URL('./server-html.json', import.meta.url), JSON.stringify(out))
process.stdout.write(`wrote ${Object.keys(out).length} variants, warnings=${JSON.stringify(warnings)}\n`)
