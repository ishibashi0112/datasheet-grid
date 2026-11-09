const { launch, iphone, cdpTap } = require('./lib.cjs')
const URL_ = process.env.MIN || 'http://127.0.0.1:5412/min.html'
;(async () => {
  for (const col of ['状態', '名前', '数量']) {
    const { browser, context, page } = await launch({ ...iphone(), locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await page.goto(URL_); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const btn = await page.evaluate((col) => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes(col)); const b = h.querySelector('button[aria-label$="列メニュー"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, col)
    await cdpTap(page, cdp, btn.x, btn.y); await page.waitForTimeout(600)
    await page.evaluate(() => {
      window.__ev = []
      const snap = () => { const p = document.querySelectorAll('.ssg-menu-panel'); return `panels=${p.length} sub=${[...document.querySelectorAll('.ssg-menu-item')].some((x) => /左に固定/.test(x.textContent))}` }
      for (const t of ['pointerdown', 'pointerup', 'click'])
        document.addEventListener(t, (e) => window.__ev.push(`${t} target=${e.target.className || e.target.tagName} ${snap()}`), true)
      new MutationObserver(() => window.__ev.push('mut ' + snap())).observe(document.body, { childList: true, subtree: true })
    })
    const pin = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find((x) => x.textContent.includes('列の固定')); const r = e.getBoundingClientRect(); const pr = e.closest('.ssg-menu-panel').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, panel: [Math.round(pr.left), Math.round(pr.right)] } })
    await cdpTap(page, cdp, pin.x, pin.y); await page.waitForTimeout(600)
    const ev = await page.evaluate(() => window.__ev)
    console.log(col, 'panel', pin.panel, '\n  ' + [...new Set(ev)].slice(0, 14).join('\n  '))
    await browser.close()
  }
})()
