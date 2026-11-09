const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  for (const mode of (process.argv[2] ?? 'none,sort,idsort,filter,prepend').split(',')) {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
    await page.goto(`http://localhost:5407/repro-append.html?mode=${mode}`)
    await page.waitForSelector('[data-pane="center"].ssg-body-row', { timeout: 120000 })
    await wait(1500)
    const ts = []
    for (let i = 0; i < 5; i++) {
      await page.click('#add')
      await page.waitForFunction(() => window.__dt !== undefined && window.__dt > 0)
      ts.push(Math.round(await page.evaluate(() => { const d = window.__dt; window.__dt = undefined; return d })))
      await wait(400)
    }
    console.log(mode, 'append 50 rows → paint ms', JSON.stringify(ts))
    await page.close()
  }
  await browser.close()
})()
