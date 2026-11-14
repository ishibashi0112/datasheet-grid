const { launch, iphone, cdpTap, BASE } = require('./lib.cjs')
const subOpen = (page) => page.evaluate(() => document.querySelector('.ssg-menu-submenu-anchor')?.children.length > 1)
;(async () => {
  // デスクトップ: ホバーだけ
  {
    const { browser, page } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const hdr = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('項目')); const r = h.getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 } })
    await page.mouse.move(hdr.x, hdr.y); await page.waitForTimeout(200)
    const k = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('項目')); const r = h.querySelector('button[aria-label$="列メニュー"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await page.mouse.click(k.x, k.y); await page.waitForTimeout(400)
    const pin = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find((x) => x.textContent.includes('列の固定')); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await page.mouse.move(pin.x, pin.y, { steps: 5 }); await page.waitForTimeout(500)
    console.log('desktop hover only: open=', await subOpen(page))
    await page.mouse.down(); await page.waitForTimeout(50); console.log(' after mousedown open=', await subOpen(page))
    await page.mouse.up(); await page.waitForTimeout(300); console.log(' after mouseup(click) open=', await subOpen(page))
    await page.mouse.click(pin.x, pin.y); await page.waitForTimeout(300); console.log(' after 2nd click open=', await subOpen(page))
    await browser.close()
  }
  // タッチ: イベントの記録
  {
    const { browser, context, page } = await launch({ ...iphone(), locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const k = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('項目')); const r = h.querySelector('button[aria-label$="列メニュー"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await cdpTap(page, cdp, k.x, k.y); await page.waitForTimeout(500)
    await page.evaluate(() => {
      window.__ev = []
      const a = document.querySelector('.ssg-menu-submenu-anchor')
      for (const t of ['pointerover', 'pointerenter', 'pointerdown', 'pointerup', 'pointerleave', 'mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click', 'mouseleave'])
        a.addEventListener(t, (e) => window.__ev.push(`${t}(${e.pointerType ?? ''}) open=${document.querySelector('.ssg-menu-submenu-anchor')?.children.length > 1}`), true)
    })
    const pin = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find((x) => x.textContent.includes('列の固定')); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await cdpTap(page, cdp, pin.x, pin.y); await page.waitForTimeout(600)
    console.log('touch events', await page.evaluate(() => window.__ev), 'open=', await subOpen(page))
    await browser.close()
  }
})()
