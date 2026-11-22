const { launch, devices, cell } = require('./lib.cjs')
;(async () => {
  const d = { ...devices['iPhone 13'] }; delete d.defaultBrowserType
  const { browser, ctx } = await launch({ ...d, deviceScaleFactor: 1 })
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
    for (const gap of [250, 400, 700, 1000]) {
      const page = await ctx.newPage()
      await page.goto(base); await page.waitForTimeout(1000)
      await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); const c = document.querySelector('.ssg-body-row [data-ssg-col-key="photo"]'); s.scrollLeft = Math.max(0, parseFloat(c.style.left) - 4) }); await page.waitForTimeout(400)
      const boxes = []
      for (let r = 0; r < 6; r++) { const b = await cell(page, r, 'photo').locator('.ssg-row-checkbox').boundingBox(); boxes.push(b) }
      for (const b of boxes) { await page.touchscreen.tap(b.x + 8, b.y + 8); await page.waitForTimeout(gap) }
      await page.waitForTimeout(600)
      const st = []
      for (let r = 0; r < 6; r++) st.push((await cell(page, r, 'photo').locator('[role=checkbox]').getAttribute('aria-checked')) === 'true' ? 'x' : '.')
      console.log(base, 'gap', gap, st.join(''))
      await page.close()
    }
  }
  await browser.close()
})()
