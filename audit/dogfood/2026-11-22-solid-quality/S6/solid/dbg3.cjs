const { launch, devices, cell } = require('./lib.cjs')
;(async () => {
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
    for (const touch of [false, true]) {
      const d = { ...devices['iPhone 13'] }; delete d.defaultBrowserType
      const { browser, page } = await launch(touch ? { ...d, deviceScaleFactor: 1 } : {})
      await page.goto(base); await page.waitForTimeout(1200)
      const info = await page.evaluate(() => {
        const c = document.querySelector('.ssg-body-row [data-ssg-col-key="photo"]')
        const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x - c.getBoundingClientRect().x), Math.round(b.width), Math.round(b.height)] }
        const cb = c.querySelector('[role=checkbox]'); const box = c.querySelector('.ssg-row-checkbox')
        const cs = getComputedStyle(cb)
        return { coarse: matchMedia('(pointer: coarse)').matches, cell: r(c), cb: r(cb), box: r(box), cbDisplay: cs.display, cbPos: cs.position, before: getComputedStyle(cb, '::before').content + ' ' + getComputedStyle(cb, '::before').width + 'x' + getComputedStyle(cb, '::before').height + ' ' + getComputedStyle(cb, '::before').position, after: getComputedStyle(cb, '::after').content + ' ' + getComputedStyle(cb, '::after').width, cbCls: cb.className, cellCls: c.className, rootAttrs: [...document.querySelector('.ssg-root').attributes].map((a) => a.name + '=' + a.value).join(' ') }
      })
      console.log(base, touch ? 'touch' : 'mouse', JSON.stringify(info))
      await browser.close()
    }
  }
})()
