const { launch, iphone, cdpTap, BASE } = require('./lib.cjs')
const { revealColumn } = require('./helpers.cjs')
;(async () => {
  const { browser, context, page } = await launch({ ...iphone(), locale: 'ja-JP' })
  const cdp = await context.newCDPSession(page)
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  await revealColumn(page, 'value', 0)
  const hdr = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('測定値')); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2 + 20, y: b.y + b.height / 2 } })
  await cdpTap(page, cdp, hdr.x, hdr.y); await page.waitForTimeout(800)
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.ssg-bar--bottom')
    const walk = (e, d) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [`${'  '.repeat(d)}${e.tagName}.${e.className.toString().slice(0, 40)} [${Math.round(b.left)}-${Math.round(b.right)} x ${Math.round(b.top)}-${Math.round(b.bottom)}] ov=${cs.overflow} ws=${cs.whiteSpace} minw=${cs.minWidth} "${e.children.length ? '' : e.textContent.slice(0, 20)}"`, ...[...e.children].flatMap((c) => walk(c, d + 1))] }
    return walk(bar, 0).join('\n')
  })
  console.log(r)
  await browser.close()
})()
