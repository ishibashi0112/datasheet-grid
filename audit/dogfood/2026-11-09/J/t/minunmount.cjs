const { chromium } = require('playwright')
;(async () => {
  const base = process.env.BASE || 'http://localhost:5410'
  const browser = await chromium.launch()
  for (const mode of ['unmount', 'hide']) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, locale: 'ja-JP' })
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => { if (!['debug', 'info'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`) })
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
    await page.goto(`${base}/min/unmount-edit.html?mode=${mode}`)
    await page.locator('.ssg-root').waitFor()
    await page.waitForTimeout(300)
    await page.locator('[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="2"]').first().click()
    await page.keyboard.type('draft')
    await page.waitForTimeout(150)
    const editing = await page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.value ?? ''))
    await page.keyboard.press('Alt+KeyH')
    await page.waitForTimeout(300)
    const hidden = await page.textContent('#rows')
    await page.keyboard.press('Alt+KeyH')
    await page.waitForTimeout(300)
    const back = await page.textContent('#rows')
    console.log(mode, 'editing', editing, '→ 隠した直後の rows', hidden, '→ 戻した後', back, logs.join(' | '))
    await ctx.close()
  }
  await browser.close()
})()
