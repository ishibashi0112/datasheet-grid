const { open } = require('./lib.cjs')
const fs = require('fs')
async function snapshot(cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  let chunks = []
  const h = (e) => chunks.push(e.chunk)
  cdp.on('HeapProfiler.addHeapSnapshotChunk', h)
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  cdp.off('HeapProfiler.addHeapSnapshotChunk', h)
  const snap = JSON.parse(chunks.join(''))
  const f = snap.snapshot.meta.node_fields, nf = f.length
  const types = snap.snapshot.meta.node_types[0]
  const iType = f.indexOf('type'), iName = f.indexOf('name'), iSize = f.indexOf('self_size')
  const counts = new Map()
  for (let i = 0; i < snap.nodes.length; i += nf) {
    const t = types[snap.nodes[i + iType]]
    if (t !== 'object' && t !== 'closure' && t !== 'array') continue
    const name = t + ':' + snap.strings[snap.nodes[i + iName]]
    const c = counts.get(name) || [0, 0]
    c[0]++; c[1] += snap.nodes[i + iSize]
    counts.set(name, c)
  }
  return counts
}
;(async () => {
  const { browser, page } = await open()
  const cdp = await page.context().newCDPSession(page)
  const remount = async (n) => { for (let i = 0; i < n; i++) { await page.click('[data-testid=settings-trigger]'); await page.click('[data-testid=remount]'); await page.keyboard.press('Escape'); await page.waitForTimeout(150) } }
  await remount(20)
  const a = await snapshot(cdp)
  await remount(100)
  const b = await snapshot(cdp)
  const diff = []
  for (const [k, v] of b) { const o = a.get(k) || [0, 0]; if (v[0] - o[0] >= 50) diff.push([k.slice(0, 80), v[0] - o[0], v[1] - o[1]]) }
  diff.sort((x, y) => y[2] - x[2])
  console.log(diff.slice(0, 30).map((d) => d.join('\t')).join('\n'))
  await browser.close()
})()
