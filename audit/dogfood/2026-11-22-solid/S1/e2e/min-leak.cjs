const { chromium } = require('playwright')
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text().split('\n')[0]) })
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  await page.goto(url)
  await page.waitForSelector('.ssg-body-cell')
  const cdp = await page.context().newCDPSession(page)
  const heap = async () => { for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100) } return ((await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6).toFixed(1) }
  await page.evaluate(() => document.getElementById('toggle').click()); await page.waitForTimeout(200)
  const out = [await heap()]
  for (let round = 0; round < 3; round++) {
    for (let k = 0; k < 10; k++) {
      await page.evaluate(() => document.getElementById('toggle').click()); await page.waitForSelector('.ssg-body-cell'); await page.waitForTimeout(100)
      await page.evaluate(() => document.getElementById('toggle').click()); await page.waitForTimeout(80)
    }
    out.push(await heap())
  }
  console.log(url, 'heap MB at 0/10/20/30 mounts:', out.join(' / '), [...new Set(logs)])
  await browser.close()
})()
