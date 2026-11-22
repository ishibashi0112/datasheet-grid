// Node で renderToString(Vite の ssrLoadModule + @solidjs/vite-plugin の ssr)
import { createServer } from 'vite'
import solid from '@solidjs/vite-plugin'

const ssrFlag = process.argv[2] !== 'nossr'
const server = await createServer({
  configFile: false,
  root: new URL('..', import.meta.url).pathname,
  plugins: [solid({ ssr: ssrFlag })],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'warn',
})
try {
  console.log('typeof window', typeof window, 'ssr flag', ssrFlag)
  const mod = await server.ssrLoadModule('/ssr/entry-server.tsx')
  const html = mod.renderGrid()
  console.log('renderToString length', html.length)
  console.log(html.slice(0, 600))
  const cells = (html.match(/role="gridcell"/g) || []).length
  const rows = (html.match(/class="ssg-body-row"/g) || []).length
  console.log('gridcells', cells, 'body rows', rows, 'has 品目1', html.includes('品目1'), 'has 品目20', html.includes('品目20'))
  const fs = await import('node:fs'); fs.writeFileSync(new URL('./out-solid.html', import.meta.url), html)
  const s = await mod.renderGridStream()
  console.log('renderToStream awaited length', String(s).length)
} catch (e) {
  console.log('SSR ERROR', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e)
} finally {
  await server.close()
}
