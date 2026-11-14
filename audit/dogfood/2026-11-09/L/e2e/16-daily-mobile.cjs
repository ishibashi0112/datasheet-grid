const { launch, shot, iphone, cdpTap, cdpTouchDrag, BASE } = require('./lib.cjs')
const { state } = require('./helpers.cjs')
const rectOf = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const b = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 30), x: b.x + b.width / 2, y: b.y + b.height / 2, w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) } }), sel)
;(async () => {
  const { browser, context, page, logs } = await launch({ ...iphone(), locale: 'ja-JP' })
  const cdp = await context.newCDPSession(page)
  await page.goto(BASE + '#daily'); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(1000)
  console.log(await shot(page, '16-daily-iphone'))
  const sc = (await rectOf(page, '.ssg-scroll-container'))[0]
  console.log('scroll container', sc)
  // 横スワイプ 3 回
  for (let i = 0; i < 3; i++) { await cdpTouchDrag(page, cdp, { x: sc.left + 300, y: sc.top + 150 }, { x: sc.left + 80, y: sc.top + 150 }, 10); await page.waitForTimeout(300) }
  // 縦スワイプ
  await cdpTouchDrag(page, cdp, { x: sc.left + 250, y: sc.top + 300 }, { x: sc.left + 250, y: sc.top + 60 }, 10); await page.waitForTimeout(600)
  console.log('scroll', await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); return { top: s.scrollTop, left: s.scrollLeft, maxLeft: s.scrollWidth - s.clientWidth } }))
  console.log(await shot(page, '16-daily-iphone-swiped'))
  // 見えている日の列のセルをダブルタップ
  const cell = await page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
    for (const c of document.querySelectorAll('.ssg-body-row[data-pane=center] [role=gridcell]')) { const b = c.getBoundingClientRect(); if (b.left > sc.left + 180 && b.right < sc.right - 70 && b.top > sc.top + 80 && b.bottom < sc.bottom - 60) return { x: b.x + b.width / 2, y: b.y + b.height / 2, key: c.getAttribute('data-ssg-col-key'), ri: c.closest('[role=row]').getAttribute('aria-rowindex') } }
  })
  console.log('target', cell)
  await cdpTap(page, cdp, cell.x, cell.y); await page.waitForTimeout(120); await cdpTap(page, cdp, cell.x, cell.y); await page.waitForTimeout(500)
  console.log('dbl tap', await state(page))
  const opts = await rectOf(page, '[role=option]')
  console.log('options', opts.map((o) => `${o.t}@${o.left},${o.top} ${o.w}x${o.h}`))
  console.log(await shot(page, '16-daily-iphone-select'))
  const x = opts.find((o) => o.t.startsWith('×'))
  await cdpTap(page, cdp, x.x, x.y); await page.waitForTimeout(500)
  console.log('picked ×', await state(page))
  const total = await page.evaluate(() => [...document.querySelectorAll('.ssg-total-row [role=gridcell], .ssg-total-row .ssg-total-cell')].map((c) => `${c.getAttribute('data-ssg-col-key')}=${c.textContent}`).filter((s) => !s.endsWith('=')).join(' '))
  console.log('total row', total)
  console.log(await shot(page, '16-daily-iphone-after'))
  // 横向き
  await page.setViewportSize({ width: 664, height: 390 }); await page.waitForTimeout(800)
  console.log(await shot(page, '16-daily-iphone-landscape'))
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
