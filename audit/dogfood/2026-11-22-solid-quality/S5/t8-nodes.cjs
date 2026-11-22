// DOM ノードの数の内訳(株価タブ、更新を止めた状態)
// 使い方: node t8-nodes.cjs <label> [query]
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2] ?? 'x'
  const q = process.argv[3] ?? 'n=1000&tab=stocks&mode=off'
  const { browser, context, page, logs } = await open(`http://127.0.0.1:5505/?${q}`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 })
  await sleep(2000)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  const dom = await page.evaluate(() => {
    const all = document.querySelectorAll('*')
    const count = (s) => document.querySelectorAll(s).length
    // 全ノード(テキスト・コメントを含む)
    let text = 0, comment = 0, el = 0
    const walk = document.createTreeWalker(document, NodeFilter.SHOW_ALL)
    let n
    while ((n = walk.nextNode())) {
      if (n.nodeType === 1) el++
      else if (n.nodeType === 3) text++
      else if (n.nodeType === 8) comment++
    }
    const tags = {}
    for (const e of all) tags[e.tagName] = (tags[e.tagName] ?? 0) + 1
    const cell = document.querySelector('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row) [data-ssg-col-key=price]')
    const cellChg = document.querySelector('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row) [data-ssg-col-key=changePct]')
    const cellSig = document.querySelector('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row) [data-ssg-col-key=signal]')
    const emptyText = [...(function* () { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) yield t })()].filter((t) => t.data === '').length
    return {
      elements: el, text, comment, emptyText,
      rows: count('.ssg-body-row'), cells: count('.ssg-body-cell'),
      tags,
      priceCell: cell?.outerHTML.slice(0, 400),
      priceCellChildNodes: cell ? [...cell.childNodes].map((c) => c.nodeType + ':' + (c.nodeName)).join(',') : null,
      pctCell: cellChg?.outerHTML.slice(0, 400),
      sigCell: cellSig?.outerHTML.slice(0, 500),
    }
  })
  console.log(JSON.stringify({ label, cdpNodes: m.Nodes, docs: m.Documents, ...dom }, null, 1))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
