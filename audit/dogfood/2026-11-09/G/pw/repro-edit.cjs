const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
  await page.goto(`http://localhost:5407/repro-append.html?mode=sort`)
  await page.waitForSelector('[data-pane="center"].ssg-body-row', { timeout: 120000 })
  await wait(1500)
  const edit = async (colIdx, text) => {
    const cell = page.locator('[data-pane="center"].ssg-body-row').nth(3).locator('[role=gridcell]').nth(colIdx)
    const b = await cell.boundingBox()
    await page.mouse.click(b.x + 10, b.y + b.height / 2)
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__dt !== undefined && window.__dt > 0, null, { timeout: 30000 })
    return Math.round(await page.evaluate(() => { const d = window.__dt; window.__dt = undefined; return d }))
  }
  const r = []
  for (let i = 0; i < 3; i++) r.push(['level', await edit(2, 'WARN' + i)])
  for (let i = 0; i < 3; i++) r.push(['ts', await edit(1, '2026-11-05 12:00:0' + i)])
  console.log('edit under ts-desc sort → paint ms', JSON.stringify(r))
  await browser.close()
})()
