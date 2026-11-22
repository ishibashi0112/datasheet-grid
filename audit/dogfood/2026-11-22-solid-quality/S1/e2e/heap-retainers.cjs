// ヒープスナップショットから、外した後に残っている行オブジェクトの保持経路を探す
const { chromium } = require('playwright')
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await page.goto(url)
  await page.waitForSelector('.ssg-body-cell')
  const cdp = await page.context().newCDPSession(page)
  const toggle = () => page.evaluate(() => document.getElementById('toggle').click())
  for (let k = 0; k < 3; k++) { await toggle(); await page.waitForTimeout(150); await toggle(); await page.waitForSelector('.ssg-body-cell'); await page.waitForTimeout(150) }
  await toggle(); await page.waitForTimeout(300)
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage')
  let chunks = []
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk))
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  const snap = JSON.parse(chunks.join(''))
  await browser.close()
  const m = snap.snapshot.meta
  const NF = m.node_fields.length, EF = m.edge_fields.length
  const nType = m.node_fields.indexOf('type'), nName = m.node_fields.indexOf('name'), nEdges = m.node_fields.indexOf('edge_count'), nId = m.node_fields.indexOf('id')
  const eType = m.edge_fields.indexOf('type'), eName = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node')
  const nodeTypes = m.node_types[0], edgeTypes = m.edge_types[0]
  const N = snap.nodes.length / NF
  const strings = snap.strings
  const firstEdge = new Uint32Array(N + 1)
  for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += snap.nodes[i * NF + nEdges] * EF }
  firstEdge[N] = snap.edges.length
  const retainers = Array.from({ length: N }, () => [])
  for (let i = 0; i < N; i++) {
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
      const to = snap.edges[e + eTo] / NF
      const et = edgeTypes[snap.edges[e + eType]]
      if (et === 'weak') continue
      const nm = et === 'element' || et === 'hidden' ? String(snap.edges[e + eName]) : strings[snap.edges[e + eName]]
      retainers[to].push([i, et, nm])
    }
  }
  const name = (i) => strings[snap.nodes[i * NF + nName]]
  const type = (i) => nodeTypes[snap.nodes[i * NF + nType]]
  // 'item 7' の文字列を持つオブジェクト(行)を数える
  const target = process.argv[3] || 'item 7'
  const strNodes = []
  for (let i = 0; i < N; i++) if (type(i) === 'string' && name(i) === target) strNodes.push(i)
  console.log('string nodes', target, strNodes.length)
  const rowObjs = new Set()
  for (const s of strNodes) for (const [from, et, nm] of retainers[s]) if (nm === 'name') rowObjs.add(from)
  console.log('row objects having name=', target, rowObjs.size)
  // 1 つの行から根まで BFS(短い経路)
  const start = [...rowObjs][0]
  if (start === undefined) return
  const prev = new Map([[start, null]])
  const q = [start]
  let found = null
  while (q.length) {
    const cur = q.shift()
    if (type(cur) === 'synthetic' || name(cur).startsWith('(GC roots)') || name(cur) === 'Window' || name(cur).startsWith('Window /')) { found = cur; break }
    for (const [from, et, nm] of retainers[cur]) if (!prev.has(from)) { prev.set(from, [cur, et, nm]); q.push(from) }
  }
  let path = []
  for (let c = found; c !== null && c !== undefined; ) { const p = prev.get(c); if (!p) break; path.push(`${type(c)}:${name(c).slice(0, 60)} --[${p[1]}:${p[2]}]-->`); c = p[0] }
  console.log(path.join('\n'))
  console.log('<row object>')
})()
