// タッチ: 列幅の変更(境界からの距離を変えて)・行番号のタップ・展開トグルの近くのタップ
const { launch, devices, cell, active } = require('./lib.cjs')
;(async () => {
  const d = { ...devices['iPad Mini'] }; delete d.defaultBrowserType
  const { browser, ctx } = await launch({ ...d, deviceScaleFactor: 1 })
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
    const res = []
    for (const off of [-10, -4, 0, 4]) {
      const page = await ctx.newPage(); await page.goto(base); await page.waitForTimeout(1000)
      const cdp = await page.context().newCDPSession(page)
      const h = await page.locator('.grid-area [role="columnheader"][data-ssg-col-key="item"]').first().boundingBox()
      const x = h.x + h.width + off, y = h.y + h.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(100)
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 6 * i, y }] }); await page.waitForTimeout(30) }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(400)
      const w = (await page.locator('.grid-area [role="columnheader"][data-ssg-col-key="item"]').first().boundingBox()).width
      res.push(`${off}:${Math.round(h.width)}→${Math.round(w)}`)
      await page.close()
    }
    // 展開トグルの近く(ボタンの外 6px)をタップ
    const page = await ctx.newPage(); await page.goto(base); await page.waitForTimeout(1000)
    const tb = await page.locator('.grid-area .ssg-body-row[data-row-index="1"] button[aria-expanded]').first().boundingBox()
    await page.touchscreen.tap(tb.x + tb.width + 4, tb.y + tb.height / 2); await page.waitForTimeout(500)
    res.push('toggle+4px:' + await page.locator('.grid-area button[aria-expanded="true"]').count())
    const rn = await page.locator('.grid-area .ssg-body-row[data-row-index="4"] [role=rowheader]').first().boundingBox()
    await page.touchscreen.tap(rn.x + 5, rn.y + 5); await page.waitForTimeout(400)
    res.push('rowheader tap sel:' + await page.locator('.grid-area [aria-selected=true]').count())
    await page.close()
    console.log(base, res.join('  '))
  }
  await browser.close()
})()
