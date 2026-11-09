const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  for (const c of ['', 'wrap-fwd', 'wrap-plain']) {
    const page = await browser.newPage({ deviceScaleFactor: 1 })
    const logs = []
    page.on('console', (m) => { if (m.type() !== 'debug' && m.type() !== 'info' && m.type() !== 'log') logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`) })
    page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message))
    await page.goto('http://127.0.0.1:5406/mini.html?case=' + c)
    await page.waitForSelector('.ssg-body-cell')
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => { const g = window.__mini.ref.current; return g ? { ok: true, rn: g.getRowNumber(3), state: !!g.getState() } : { ok: false } })
    console.log(c || 'direct', JSON.stringify(r), logs)
    await page.close()
  }
  await browser.close()
})()
