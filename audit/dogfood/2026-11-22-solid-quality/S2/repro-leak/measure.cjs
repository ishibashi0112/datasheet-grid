// node measure.cjs <url> : トグル 30 往復でヒープ / DOM ノード / リスナーを測る
const { chromium } = require('playwright')
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const logs = []
  page.on('console', (m) => logs.push(m.type() + ' ' + m.text().slice(0, 200)))
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  const cdp = await page.context().newCDPSession(page)
  const m = async (label) => {
    await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(200); await cdp.send('HeapProfiler.collectGarbage')
    const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize
    const dom = await cdp.send('Memory.getDOMCounters')
    return { label, heapMB: +(heap / 1048576).toFixed(2), nodes: dom.nodes, jsListeners: dom.jsEventListeners }
  }
  await page.goto(url)
  await page.waitForTimeout(1000)
  const res = [await m('start (shown)')]
  for (let i = 1; i <= 30; i++) {
    await page.click('#toggle'); await page.waitForTimeout(150)
    await page.click('#toggle'); await page.waitForTimeout(250)
    if ([1, 10, 20, 30].includes(i)) res.push(await m(`after ${i}`))
  }
  await page.click('#toggle'); await page.waitForTimeout(250)
  res.push(await m('hidden'))
  console.table(res)
  const uniq = [...new Set(logs)]
  console.log(uniq.slice(0, 10).join('\n'))
  await browser.close()
})()
