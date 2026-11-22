// グリッドを出して → 隠した後のヒープで、外れた .ssg-scroll-container の保持経路を出す
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  await page.goto(process.argv[2])
  await page.waitForTimeout(1200)
  for (let k = 0; k < Number(process.env.T ?? 1); k++) { await page.click('#toggle'); await page.waitForTimeout(400) }
  await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage')
  let chunks = []
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk))
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  const snap = JSON.parse(chunks.join('')); chunks = null
  const m = snap.snapshot.meta, NF = m.node_fields.length, EF = m.edge_fields.length
  const nTypes = m.node_types[0], eTypes = m.edge_types[0], N = snap.nodes, E = snap.edges, S = snap.strings
  const iType = m.node_fields.indexOf('type'), iName = m.node_fields.indexOf('name'), iEC = m.node_fields.indexOf('edge_count'), iDet = m.node_fields.indexOf('detachedness')
  const eiType = m.edge_fields.indexOf('type'), eiName = m.edge_fields.indexOf('name_or_index'), eiTo = m.edge_fields.indexOf('to_node')
  const count = N.length / NF
  const retainers = Array.from({ length: count }, () => [])
  for (let i = 0, e = 0; i < count; i++) {
    const end = e + N[i * NF + iEC] * EF
    for (; e < end; e += EF) {
      const t = eTypes[E[e + eiType]]
      if (t === 'weak') continue
      retainers[E[e + eiTo] / NF].push([i, t, t === 'element' || t === 'hidden' ? String(E[e + eiName]) : S[E[e + eiName]]])
    }
  }
  const name = (i) => `${nTypes[N[i * NF + iType]]}:${S[N[i * NF + iName]]}`.slice(0, 110)
  const det = []
  for (let i = 0; i < count; i++) if (N[i * NF + iDet] === 2) det.push(i)
  console.log('detached:', det.length)
  for (const start of det.filter((i) => S[N[i * NF + iName]].includes('ssg-scroll-container'))) {
    const prev = new Map([[start, null]]), q = [start]; let found = null
    while (q.length && !found) {
      const cur = q.shift()
      for (const [r, t, nm] of retainers[cur]) {
        if (prev.has(r)) continue
        prev.set(r, [cur, t, nm])
        const rn = name(r)
        if (rn.startsWith('synthetic:(GC roots)') || rn.includes('Window /')) { found = r; break }
        q.push(r)
      }
    }
    const chain = []; let c = found
    while (c != null && c !== start) { const p = prev.get(c); chain.push(`${name(c)} --[${p[1]}:${String(p[2]).slice(0, 50)}]-->`); c = p[0] }
    chain.push(name(start)); console.log('\n=== chain\n' + chain.join('\n'))
  }
  await browser.close()
})()
