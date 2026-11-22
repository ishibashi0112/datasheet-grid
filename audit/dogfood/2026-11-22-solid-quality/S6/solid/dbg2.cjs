const { launch, devices, cell, active } = require('./lib.cjs')
const dev = 'iPhone 13'
;(async () => {
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/', 'http://localhost:5506/']) {
    for (const mode of ['mouse', 'touch', 'tap-on-box']) {
      const d = { ...devices[dev] }; delete d.defaultBrowserType
      const { browser, page, logs } = await launch(mode === 'mouse' ? {} : { ...d, deviceScaleFactor: 1 })
      await page.goto(base); await page.waitForTimeout(1200)
      await page.evaluate(() => { window.__m = []; new MutationObserver((ms) => { for (const m of ms) if (m.attributeName === 'aria-checked') window.__m.push(m.target.getAttribute('aria-checked')) }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] }) })
      await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); const c = document.querySelector('.ssg-body-row [data-ssg-col-key="photo"]'); s.scrollLeft = Math.max(0, parseFloat(c.style.left) - 4) }); await page.waitForTimeout(400)
      const ph = cell(page, 2, 'photo')
      const tgt = mode === 'tap-on-box' ? ph.locator('.ssg-row-checkbox') : ph
      const res = []
      for (let i = 0; i < 3; i++) {
        const b = await tgt.boundingBox()
        if (mode === 'mouse') await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
        else await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
        await page.waitForTimeout(500)
        res.push(await ph.locator('[role=checkbox]').getAttribute('aria-checked'))
      }
      console.log(base, mode, JSON.stringify(res), 'mutations', JSON.stringify(await page.evaluate(() => window.__m)), await active(page), logs.filter((l) => !/solid-performance|Download the/.test(l)).slice(0, 3).join(' / '))
      await browser.close()
    }
  }
})()
