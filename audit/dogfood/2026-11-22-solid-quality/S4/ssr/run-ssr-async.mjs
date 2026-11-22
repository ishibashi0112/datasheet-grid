// <Loading> の中の非同期の行を Node で描く
import { createServer } from 'vite'
import solid from '@solidjs/vite-plugin'
const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, plugins: [solid({ ssr: true })], server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'warn' })
const errs = []
const origErr = console.error
console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 300)); }
try {
  const mod = await server.ssrLoadModule('/ssr/entry-async.tsx')
  const s1 = mod.renderAsyncString()
  console.log('renderToString: len', s1.length, 'loading fallback', s1.includes('読み込み中'), 'grid', s1.includes('role="grid"'))
  const s2 = String(await mod.renderAsyncStream())
  console.log('renderToStream: len', s2.length, 'loading fallback', s2.includes('読み込み中'), 'grid', s2.includes('role="grid"'), 'status', (s2.match(/data-testid="status"[^>]*>([^<]*)/) || [])[1], 'P-001', s2.includes('P-001'), 'gridcells', (s2.match(/role="gridcell"/g) || []).length)
} catch (e) {
  console.log('SSR ERROR', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e)
} finally {
  console.error = origErr
  console.log('console.error during SSR', errs.length, errs.slice(0, 3))
  await server.close()
}
