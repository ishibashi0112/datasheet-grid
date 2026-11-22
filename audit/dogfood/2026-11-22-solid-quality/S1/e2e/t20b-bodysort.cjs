// 本体で derivedSummary.sortSummaryText だけを読むと、何が変わったときに作り直すか
const { open, click } = require('./lib.cjs')
const BASE = process.env.BASE || 'http://localhost:5501/'
;(async () => {
  const { browser, page, logs } = await open(`${BASE}bars.html?mode=${process.argv[2] || 'bodysort'}`)
  const calls = () => page.evaluate(() => window.__barCalls.top)
  const r = []
  r.push(['load', await calls()])
  await click(page, 3, 3); await page.waitForTimeout(150); r.push(['click', await calls()])
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150); r.push(['5x ArrowDown', await calls()])
  await page.mouse.move(600, 500)
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(40) }
  await page.waitForTimeout(300); r.push(['10 wheel', await calls()])
  await page.mouse.move(300, 300); await page.mouse.move(700, 400); await page.waitForTimeout(100); r.push(['hover', await calls()])
  await page.click('#my-filter'); await page.keyboard.type('緑', { delay: 30 }); await page.waitForTimeout(300); r.push(['type in bar', await calls(), await page.evaluate(() => document.activeElement.id)])
  console.log(JSON.stringify(r))
  console.log('LOGS', logs.filter((l) => !l.includes('[vite]')).length)
  await browser.close()
})()
