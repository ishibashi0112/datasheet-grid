const { chromium } = require('playwright')
;(async () => {
  const base = process.env.BASE ?? 'http://localhost:3501'
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`))
  await page.goto(base + '/users', { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  const info = await page.evaluate(() => ({
    roots: document.querySelectorAll('.ssg-root').length,
    shells: document.querySelectorAll('.ssg-shell').length,
    rows: document.querySelectorAll('.ssg-body-row:not([data-skeleton-row])').length,
    skel: document.querySelectorAll('[data-skeleton-row]').length,
    firstCell: document.querySelector('.ssg-body-row:not([data-skeleton-row]) [aria-colindex="3"]')?.textContent,
    bars: [...document.querySelectorAll('.ssg-bar-chip')].map((e) => e.textContent),
  }))
  console.log(JSON.stringify(info, null, 1))
  await page.screenshot({ path: 'shot-load.png' })
  console.log(logs.join('\n'))
  await browser.close()
})()
