const { launch, devices, cell, active } = require('./lib.cjs')
;(async () => {
  const d = { ...devices['iPhone 13'] }; delete d.defaultBrowserType
  const { browser, ctx } = await launch({ ...d, deviceScaleFactor: 1 })
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
    const res = []
    for (const [dx, pre] of [[5, 0], [18, 0], [35, 0], [60, 0], [18, 1], [35, 1], [60, 1]]) {
      const page = await ctx.newPage()
      await page.goto(base); await page.waitForTimeout(1000)
      await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); const c = document.querySelector('.ssg-body-row [data-ssg-col-key="photo"]'); s.scrollLeft = Math.max(0, parseFloat(c.style.left) - 4) }); await page.waitForTimeout(400)
      const ph = cell(page, 2, 'photo'); const b = await ph.boundingBox()
      if (pre) { await page.touchscreen.tap(b.x + 60, b.y + 18); await page.waitForTimeout(800) }
      const before = await ph.locator('[role=checkbox]').getAttribute('aria-checked')
      await page.touchscreen.tap(b.x + dx, b.y + 18); await page.waitForTimeout(800)
      const after = await cell(page, 2, 'photo').locator('[role=checkbox]').getAttribute('aria-checked')
      res.push(`${pre ? 'active→' : ''}${dx}:${before}→${after}(${await active(page)})`)
      await page.close()
    }
    console.log(base, res.join('  '))
  }
  await browser.close()
})()
