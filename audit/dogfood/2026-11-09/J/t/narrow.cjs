const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('', { viewport: { width: 390, height: 844 } })
  const S = '[data-testid=sales-wrap]'
  await page.locator(S).scrollIntoViewIfNeeded()
  const info = async () => page.evaluate((S) => {
    const root = document.querySelector(S + ' .ssg-root'); const rr = root.getBoundingClientRect()
    const sc = root.querySelector('.ssg-scroll-container')
    const panes = [...root.querySelectorAll('[data-pane]')].slice(0, 6).map((p) => { const b = p.getBoundingClientRect(); return `${p.dataset.pane}:${Math.round(b.left - rr.left)}..${Math.round(b.right - rr.left)}` })
    const heads = [...root.querySelectorAll('[role=columnheader]')].map((h) => { const b = h.getBoundingClientRect(); const x = b.left + b.width / 2; const top = document.elementFromPoint(Math.max(rr.left + 1, Math.min(x, rr.right - 2)), b.top + b.height / 2); return `${h.textContent.replace('⋮', '').trim()}@${Math.round(b.left - rr.left)}${top && h.contains(top) ? '' : '(隠)'}` })
    return { rootW: Math.round(rr.width), scL: sc.scrollLeft, scW: sc.scrollWidth, scCW: sc.clientWidth, heads }
  }, S)
  console.log('init', JSON.stringify(await info()))
  const sc = page.locator(`${S} .ssg-scroll-container`)
  const b = await sc.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + 150)
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(300, 0); await page.waitForTimeout(150) }
  console.log('wheel→', JSON.stringify(await info()))
  await shot(page, 'narrow-390-scrolled', { clip: { x: b.x - 20, y: b.y - 100, width: 390 - (b.x - 20), height: 420 } })
  // キーボードで中央の列へ
  const cell = page.locator(`${S} [role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="3"]`).first()
  await page.evaluate((S) => document.querySelector(S + ' .ssg-scroll-container').scrollLeft = 0, S)
  await page.waitForTimeout(100)
  console.log(logs.filter((l) => !l.includes('DevTools')).join('\n'))
  await browser.close()
})()
