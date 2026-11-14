const { launch, shot, iphone, ipad, cdpTap, BASE } = require('./lib.cjs')
const subItems = (page) => page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].filter((e) => /固定しない|左に固定|右に固定/.test(e.textContent)).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2, l: Math.round(r.left), r: Math.round(r.right) } }))
async function openPin(page, tapFn) {
  const k = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('項目')); const r = h.querySelector('button[aria-label$="列メニュー"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await tapFn(k.x, k.y); await page.waitForTimeout(500)
  const pin = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find((x) => x.textContent.includes('列の固定')); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  return pin
}
;(async () => {
  for (const [name, opts] of [['iphone', iphone()], ['ipad', ipad()]]) {
    const { browser, context, page } = await launch({ ...opts, locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    const tapFn = (x, y) => cdpTap(page, cdp, x, y)
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const pin = await openPin(page, tapFn)
    await tapFn(pin.x, pin.y)
    for (const t of [50, 300, 800]) { await page.waitForTimeout(t); console.log(name, 'after 1 tap +', t, 'ms', await subItems(page)) }
    await tapFn(pin.x, pin.y); await page.waitForTimeout(400)
    console.log(name, 'after 2nd tap', await subItems(page))
    // Playwright の touchscreen.tap
    await page.touchscreen.tap(pin.x, pin.y); await page.waitForTimeout(400)
    console.log(name, 'after touchscreen.tap', await subItems(page))
    await shot(page, `21-${name}-pin`)
    await browser.close()
  }
  // デスクトップのクリック
  const { browser, page } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  const hdr = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('項目')); const r = h.getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 } })
  await page.mouse.move(hdr.x, hdr.y); await page.waitForTimeout(200)
  const pin = await openPin(page, (x, y) => page.mouse.click(x, y))
  await page.mouse.click(pin.x, pin.y); await page.waitForTimeout(400)
  console.log('desktop click', await subItems(page))
  await browser.close()
})()
