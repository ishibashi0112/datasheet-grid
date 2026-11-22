const { launch, devices, cell } = require('./lib.cjs')
;(async () => {
  const d = { ...devices['iPhone 13'] }; delete d.defaultBrowserType
  const { browser, ctx } = await launch({ ...d, deviceScaleFactor: 1 })
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
    const page = await ctx.newPage()
    await page.goto(base); await page.waitForTimeout(1000)
    await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); const c = document.querySelector('.ssg-body-row [data-ssg-col-key="photo"]'); s.scrollLeft = Math.max(0, parseFloat(c.style.left) - 4) }); await page.waitForTimeout(400)
    const info = await page.evaluate(() => { const cb = document.querySelector('.ssg-body-row[data-row-index="2"] [data-ssg-col-key="photo"] [role=checkbox]'); return { onclick: typeof cb.onclick, cursor: getComputedStyle(cb).cursor, cellCursor: getComputedStyle(cb.parentElement).cursor } })
    // イベントの記録
    await page.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend']) document.addEventListener(t, (e) => window.__ev.push(t + ':' + (e.target.className || e.target.tagName).toString().slice(0, 22)), true) })
    const b = await cell(page, 2, 'photo').boundingBox()
    await page.touchscreen.tap(b.x + 35, b.y + 18); await page.waitForTimeout(600)
    const ev = await page.evaluate(() => window.__ev)
    // click だけを合成
    const r2 = await page.evaluate(async () => { const cb = document.querySelector('.ssg-body-row[data-row-index="3"] [data-ssg-col-key="photo"] [role=checkbox]'); const b = cb.getAttribute('aria-checked'); cb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); await new Promise((r) => setTimeout(r, 300)); return b + '→' + document.querySelector('.ssg-body-row[data-row-index="3"] [data-ssg-col-key="photo"] [role=checkbox]').getAttribute('aria-checked') })
    console.log(base, JSON.stringify(info), ev.join(' '), 'synthetic click only:', r2)
    await page.close()
  }
  await browser.close()
})()
