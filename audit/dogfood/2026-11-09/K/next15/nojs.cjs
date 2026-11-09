const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto('http://localhost:3411/', { waitUntil: 'load' })
  await page.screenshot({ path: __dirname + '/shots/prod-nojs.png' })
  // CLS: JS ありで読み込み時のレイアウトシフト
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(() => {
    window.__cls = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  })
  await p2.goto('http://localhost:3411/', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(1000)
  console.log('CLS', await p2.evaluate(() => window.__cls))
  await browser.close()
})()
