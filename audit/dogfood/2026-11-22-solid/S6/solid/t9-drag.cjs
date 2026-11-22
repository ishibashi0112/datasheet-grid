// 行ドラッグ(マウス / タッチ)と右クリックメニューの moveRow
const { launch, devices, cell } = require('./lib.cjs')
;(async () => {
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/solid/,http://localhost:5506/').split(',')) {
    const tag = base.includes('react') ? 'react' : base.includes('solid') ? 'solidprod' : 'soliddev'
    for (const mode of ['mouse', 'touch']) {
      const d = { ...devices['iPad Mini'] }; delete d.defaultBrowserType
      const { browser, page, logs } = await launch(mode === 'touch' ? { ...d, deviceScaleFactor: 1 } : {})
      await page.goto(base); await page.waitForTimeout(1200)
      const order = () => page.evaluate(() => [...document.querySelectorAll('.grid-area .ssg-body-row')].filter((r) => r.querySelector('[data-ssg-col-key="item"]')).map((r) => [Number(r.dataset.rowIndex), r.querySelector('[data-ssg-col-key="item"]').textContent]).sort((a, b) => a[0] - b[0]).slice(0, 5).map((x) => x[1]).join(','))
      const moves = () => page.evaluate(() => [...document.querySelectorAll('ul[hidden] li')].map((l) => l.textContent).join(' ; '))
      const before = await order()
      const h = await cell(page, 0, '__ssg_row_drag_handle__').boundingBox()
      const t = await cell(page, 3, 'item').boundingBox()
      if (mode === 'mouse') {
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down()
        for (let i = 1; i <= 12; i++) { await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + ((t.y + t.height * 0.8 - h.y - h.height / 2) * i) / 12); await page.waitForTimeout(30) }
        await page.waitForTimeout(200); await page.mouse.up()
      } else {
        const cdp = await page.context().newCDPSession(page)
        const x = h.x + h.width / 2, y0 = h.y + h.height / 2, y1 = t.y + t.height * 0.8
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] }); await page.waitForTimeout(350)
        for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 12 }] }); await page.waitForTimeout(30) }
        await page.waitForTimeout(200); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      }
      await page.waitForTimeout(800)
      const after = await order()
      const sc = await page.evaluate(() => document.querySelector('.grid-area .ssg-scroll-container').scrollTop)
      console.log(tag, mode, 'before', before, '\n   after ', after, '\n   moves', await moves(), 'scrollTop', sc)
      if (mode === 'mouse') {
        await cell(page, 2, 'item').click({ button: 'right' }); await page.waitForTimeout(300)
        await page.locator('[role=menu] [role=menuitem]', { hasText: '上へ' }).click(); await page.waitForTimeout(500)
        console.log(tag, 'ctx 上へ', await order(), '| moves', await moves())
      }
      const L = logs.filter((l) => !/solid-performance|Download the/.test(l)); if (L.length) console.log(tag, mode, 'logs', L.join(' / '))
      await browser.close()
    }
  }
})()
