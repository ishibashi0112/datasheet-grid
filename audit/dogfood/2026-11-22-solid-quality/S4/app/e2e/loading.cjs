const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:5504/'
;(async () => {
  const browser = await chromium.launch()
  for (const when of (process.argv[2] || 'effect,settled,initial,dataeffect').split(',')) {
    const page = await browser.newPage()
    const logs = []
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    await page.goto(`${BASE}loading.html?when=${when}`)
    await page.waitForSelector('.ssg-body-cell')
    await page.waitForTimeout(800)
    const r = await page.evaluate(() => ({ log: window.log, sort: window.grid.getState().sort, range: window.grid.getVisibleRowRange(), firstRow: document.querySelector('[data-pane="center"].ssg-body-row')?.getAttribute('data-row-key') }))
    console.log(when, JSON.stringify(r))
    console.log('  LOGS', logs.filter((l) => !l.includes('[vite]')).map((l) => l.slice(0, 200)).join(' / '))
    await page.close()
  }
  await browser.close()
})()
