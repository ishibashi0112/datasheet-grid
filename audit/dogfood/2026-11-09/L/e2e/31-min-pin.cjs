const { launch, shot, iphone, ipad, cdpTap } = require('./lib.cjs')
const URL_ = process.env.MIN || 'http://127.0.0.1:5412/min.html'
const tag = process.env.TAG || 'dev'
;(async () => {
  for (const [name, dev] of [['iphone', iphone()], ['ipad', ipad()]]) {
    const { browser, context, page, logs } = await launch({ ...dev, locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await page.goto(URL_); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const btn = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('状態')); const b = h.querySelector('button[aria-label$="列メニュー"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
    await cdpTap(page, cdp, btn.x, btn.y); await page.waitForTimeout(600)
    const menuItems = () => page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].map((e) => e.textContent.trim()))
    console.log(name, 'menu open:', (await menuItems()).length)
    const pin = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find((b) => b.textContent.includes('列の固定')); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, exp: e.getAttribute('aria-expanded'), hp: e.getAttribute('aria-haspopup') } })
    console.log(name, '列の固定 attrs', pin.exp, pin.hp)
    await cdpTap(page, cdp, pin.x, pin.y)
    const seq = []
    for (const t of [50, 150, 300, 700]) { await page.waitForTimeout(t - (seq.length ? [50, 150, 300, 700][seq.length - 1] : 0)); const it = await menuItems(); seq.push(`${t}ms: ${it.length} items, sub=${it.some((x) => /左に固定/.test(x))}`) }
    console.log(name, 'after tap', seq.join(' / '))
    console.log(await shot(page, `31-${tag}-${name}-pin`))
    console.log(logs.filter((l) => !l.includes('vite')).join(' | '))
    await browser.close()
  }
})()
