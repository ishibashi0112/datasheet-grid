const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(m.type() + ' ' + m.text()))
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto((process.argv[2] ?? 'http://localhost:5407/') + '?live=1')
  await page.waitForSelector('[data-pane="center"].ssg-body-row', { timeout: 120000 })
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = await cdp.send('Performance.getMetrics'); const g = (n) => m.metrics.find((x) => x.name === n)?.value; return { heapMB: Math.round(g('JSHeapUsedSize') / 1e6), nodes: g('Nodes'), listeners: g('JSEventListeners'), rows: await page.locator('.toolbar .muted').first().innerText() } }
  const out = []
  for (let i = 0; i <= 4; i++) {
    out.push({ t: i * 30, ...(await heap()) })
    if (i < 4) await wait(30000)
  }
  console.log(JSON.stringify(out))
  console.log(logs.filter((l) => !l.includes('DevTools')).slice(0, 10).join('\n'))
  await browser.close()
})()
