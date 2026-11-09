const { launch, iphone, cdpTap, cdpTouchDrag, BASE } = require('./lib.cjs')
;(async () => {
  for (const rate of [1, 4]) {
    const { browser, context, page } = await launch({ ...iphone(), locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.goto(BASE + '#daily'); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(1500)
    const res = []
    for (let i = 0; i < 8; i++) {
      const c = await page.evaluate((i) => { const g = document.querySelector('.ssg-scroll-container').getBoundingClientRect(); const cells = [...document.querySelectorAll('.ssg-body-row[data-pane=center] [role=gridcell]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > g.top + 80 && r.bottom < g.bottom - 60 && r.left > g.left + 170 && r.right < g.right - 70 }); const e = cells[(i * 3) % cells.length]; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: e.getAttribute('data-ssg-col-key'), row: e.closest('[aria-rowindex]').getAttribute('aria-rowindex') } }, i)
      await cdpTap(page, cdp, c.x, c.y); await page.waitForTimeout(60); await cdpTap(page, cdp, c.x, c.y)
      const ok = await page.waitForFunction(() => !!document.querySelector('.ssg-cell-editor'), null, { timeout: 1500 }).then(() => true).catch(() => false)
      const act = await page.evaluate(() => { const s = document.querySelector('.ssg-shell'); const c = document.getElementById(s.getAttribute('aria-activedescendant')); return c ? c.closest('[aria-rowindex]').getAttribute('aria-rowindex') + ':' + c.getAttribute('data-ssg-col-key') : null })
      res.push(`${c.row}:${c.key}->${ok ? 'edit' : 'no-edit(active ' + act + ')'}`)
      await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    }
    console.log('rate', rate, res.join('  '))
    await browser.close()
  }
})()
