const { chromium } = require('playwright')
;(async () => {
  const base = process.env.BASE || 'http://localhost:5410'
  const browser = await chromium.launch()
  for (const ci of [1, 2, 3, 4, 5]) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, locale: 'ja-JP' })
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => { if (!['debug', 'info'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`) })
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
    await page.goto(`${base}/min/space.html`)
    await page.locator('.ssg-root').waitFor()
    await page.waitForTimeout(300)
    const c = page.locator(`[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="${ci + 1}"]`).first()
    const title = await page.locator(`[role=columnheader][aria-colindex="${ci + 1}"]`).first().textContent()
    await c.click()
    await page.waitForTimeout(150)
    const y0 = await page.evaluate(() => scrollY)
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const st = await page.evaluate(() => ({ y: scrollY, editing: !!document.querySelector('.ssg-root input:not(.ssg-bar-input)'), popup: !!document.querySelector('.ssg-select-editor-popover') }))
    console.log(title.replace('⋮', ''), 'scrollY', y0, '→', st.y, 'editing', st.editing, 'popup', st.popup, logs.join(' | '))
    await ctx.close()
  }
  await browser.close()
})()
