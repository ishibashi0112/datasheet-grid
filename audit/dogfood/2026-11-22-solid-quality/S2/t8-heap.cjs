// Users ↔ Settings を N 往復した後のヒープスナップショットから、外れた .ssg-root の保持経路を出す
const { launch, BASE } = require('./lib.cjs')
const fs = require('fs')
;(async () => {
  const { browser, page } = await launch()
  const cdp = await page.context().newCDPSession(page)
  await page.goto(BASE + '/users')
  await page.waitForTimeout(1500)
  const nav = async (name) => { await page.locator('.nav a', { hasText: name }).click(); await page.waitForTimeout(400) }
  for (let i = 0; i < Number(process.env.N ?? 4); i++) { for (const r of (process.env.ROUTES ?? 'Settings,Users').split(',')) await nav(r); await page.waitForTimeout(300) }
  await nav('Settings')
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  let chunks = []
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk))
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  const snap = JSON.parse(chunks.join(''))
  chunks = null
  const m = snap.snapshot.meta
  const NF = m.node_fields.length, EF = m.edge_fields.length
  const nTypes = m.node_types[0], eTypes = m.edge_types[0]
  const N = snap.nodes, E = snap.edges, S = snap.strings
  const iType = m.node_fields.indexOf('type'), iName = m.node_fields.indexOf('name'), iEC = m.node_fields.indexOf('edge_count'), iDet = m.node_fields.indexOf('detachedness')
  const eiType = m.edge_fields.indexOf('type'), eiName = m.edge_fields.indexOf('name_or_index'), eiTo = m.edge_fields.indexOf('to_node')
  const count = N.length / NF
  const firstEdge = new Uint32Array(count + 1)
  for (let i = 0, e = 0; i < count; i++) { firstEdge[i] = e; e += N[i * NF + iEC] * EF } firstEdge[count] = E.length
  // 逆辺
  const retainers = Array.from({ length: count }, () => [])
  for (let i = 0; i < count; i++) {
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
      const t = eTypes[E[e + eiType]]
      if (t === 'weak') continue
      const to = E[e + eiTo] / NF
      const nm = t === 'element' || t === 'hidden' ? String(E[e + eiName]) : S[E[e + eiName]]
      retainers[to].push([i, t, nm])
    }
  }
  const name = (i) => `${nTypes[N[i * NF + iType]]}:${S[N[i * NF + iName]]}`.slice(0, 90)
  // 外れた div で、名前に ssg-root を含むもの(Detached <div class="ssg-root ...">)
  const detached = []
  for (let i = 0; i < count; i++) if (N[i * NF + iDet] === 2) detached.push(i)
  console.log('detached total:', detached.length)
  const byName = {}
  for (const i of detached) byName[S[N[i * NF + iName]]] = (byName[S[N[i * NF + iName]]] ?? 0) + 1
  console.log(Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 8))
  // 外れたノードのうち、JS(非ネイティブ)のオブジェクトから直接参照されているもの
  const detachedSet = new Set(detached)
  const fromJs = detached.filter((i) => retainers[i].some(([r]) => !detachedSet.has(r) && nTypes[N[r * NF + iType]] !== 'native'))
  console.log('detached retained from JS:', fromJs.length)
  const tally = {}
  for (const i of fromJs) for (const [r, t, nm] of retainers[i]) if (!detachedSet.has(r)) { const k = name(r) + ' .' + nm; tally[k] = (tally[k] ?? 0) + 1 }
  console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25))
  const detachedRoots = detached.filter((i) => S[N[i * NF + iName]].includes(process.env.PICK ?? 'ssg-scroll-container'))
  console.log('instances:', detachedRoots.length)
  // BFS で GC ルート側へ(最初の 2 つ)
  for (const start of detachedRoots) {
    const prev = new Map([[start, null]])
    const q = [start]
    let found = null
    while (q.length && !found) {
      const cur = q.shift()
      for (const [r, t, nm] of retainers[cur]) {
        if (prev.has(r)) continue
        prev.set(r, [cur, t, nm])
        const rn = name(r)
        if (rn.startsWith('synthetic:(GC roots)') || rn.startsWith('synthetic:(Global') || rn.includes('Window /')) { found = r; break }
        q.push(r)
      }
    }
    const chain = []
    let c = found
    while (c != null && c !== start) { const p = prev.get(c); chain.push(`${name(c)} --[${p[1]}:${String(p[2]).slice(0, 40)}]-->`); c = p[0] }
    chain.push(name(start))
    console.log('\n=== chain\n' + chain.join('\n'))
  }
  await browser.close()
})()
