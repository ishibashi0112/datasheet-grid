const { launch, shot, iphone, cdpTouchDrag, cdpTap, BASE } = require('./lib.cjs')
;(async () => {
  const { browser, context, page, logs } = await launch(iphone())
  const cdp = await context.newCDPSession(page)
  await page.goto(BASE)
  await page.waitForSelector('.ssg-body-row')
  await page.waitForTimeout(800)
  console.log(await shot(page, '02-iphone-initial'))
  const sc = page.locator('.ssg-scroll-container')
  const box = await sc.boundingBox()
  console.log('scroll container box', box)
  const layout = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
    return {
      root: r('.ssg-root'), top: r('.ssg-top-bar, .ssg-topbar, [class*=top-bar]'), bottom: r('[class*=bottom-bar], [class*=bottombar]'),
      docW: document.documentElement.scrollWidth, winW: innerWidth, docH: document.documentElement.scrollHeight, winH: innerHeight,
      rootClasses: document.querySelector('.ssg-root').className,
    }
  })
  console.log(JSON.stringify(layout, null, 1))
  // ---- タッチの縦スクロール
  const before = await sc.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
  await cdpTouchDrag(page, cdp, { x: box.x + 200, y: box.y + 300 }, { x: box.x + 200, y: box.y + 80 }, 12)
  await page.waitForTimeout(600)
  const after = await sc.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
  console.log('touch vertical scroll', before, '->', after)
  const sel1 = await page.evaluate(() => ({ active: document.querySelectorAll('[aria-selected=true]').length, act: document.querySelector('.ssg-shell')?.getAttribute('aria-activedescendant') }))
  console.log('after scroll selection', sel1)
  // ---- 横スクロール
  await cdpTouchDrag(page, cdp, { x: box.x + 300, y: box.y + 200 }, { x: box.x + 60, y: box.y + 200 }, 12)
  await page.waitForTimeout(600)
  const after2 = await sc.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
  console.log('touch horizontal scroll', after, '->', after2)
  console.log(await shot(page, '02-iphone-scrolled'))
  const sel2 = await page.evaluate(() => ({ selected: document.querySelectorAll('[aria-selected=true]').length, act: document.querySelector('.ssg-shell')?.getAttribute('aria-activedescendant') }))
  console.log('after h-scroll selection', sel2)
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
