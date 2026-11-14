const { launch, shot, iphone, ipad, cdpTap, cdpTouchDrag, BASE } = require('./lib.cjs')
;(async () => {
  for (const [name, opts] of [['iphone', iphone()], ['iphone-land', { ...iphone(), viewport: { width: 664, height: 390 } }], ['ipad', ipad()]]) {
    const { browser, context, page, logs } = await launch({ ...opts, locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    // 上部バーの「絞り込み: なし」チップからツールパネルを開く
    const chip = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-bar--top button')].find((b) => b.textContent.includes('絞り込み')); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await cdpTap(page, cdp, chip.x, chip.y); await page.waitForTimeout(1200)
    const info = await page.evaluate(() => {
      const p = document.querySelector('.ssg-toolpanel'); if (!p) return null
      const cs = getComputedStyle(p); const r = p.getBoundingClientRect()
      const sc = [...p.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight }).map((e) => e.className + ' ' + e.clientHeight + '/' + e.scrollHeight)
      return { pos: cs.position, maxH: cs.maxHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight, docScroll: document.scrollingElement.scrollHeight + '/' + innerHeight, scrollables: sc }
    })
    console.log(name, JSON.stringify(info))
    console.log(await shot(page, `22b-toolpanel-${name}`))
    await browser.close()
  }
})()
