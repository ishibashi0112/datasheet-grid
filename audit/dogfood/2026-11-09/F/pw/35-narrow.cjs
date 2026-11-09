const { open, shot, handle } = require('./lib.cjs')
;(async () => {
  for (const q of ['?extra=10', '?extra=10&pin=1']) {
    const { browser, page, logs } = await open(q, { viewport: { width: 720, height: 700 } })
    await shot(page, '35-narrow' + (q.includes('pin') ? '-pin' : ''))
    await handle(page, 'g.setScrollPosition({ left: 400, top: 200 })')
    await page.waitForTimeout(300)
    await shot(page, '35-narrow-scrolled' + (q.includes('pin') ? '-pin' : ''))
    // ドラッグハンドルの列はどこ?
    console.log(q, await page.evaluate(() => { const h = document.querySelector('.ssg-row-drag-handle'); const r = h.closest('.ssg-body-row'); return r.getAttribute('data-pane') }), logs)
    await browser.close()
  }
})()
