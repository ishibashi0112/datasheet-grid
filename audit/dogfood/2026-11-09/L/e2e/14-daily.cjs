const { launch, shot, iphone, cdpTap, cdpTouchDrag, BASE } = require('./lib.cjs')
const { state } = require('./helpers.cjs')
const ariaSnap = (page) => page.evaluate(() => {
  const grid = document.querySelector('[role=grid]')
  const hdr = [...grid.querySelectorAll('[role=columnheader]')].map((h) => `${h.getAttribute('aria-colindex')}:${(h.getAttribute('data-ssg-col-key') || h.textContent).slice(0, 6)}`)
  const rows = [...grid.querySelectorAll('[role=row]')]
  const rowInfo = rows.slice(0, 200).map((r) => ({ ri: r.getAttribute('aria-rowindex'), pane: r.getAttribute('data-pane'), cls: r.className.slice(0, 40), hidden: r.getAttribute('aria-hidden'), rn: r.querySelector('.ssg-row-header-cell')?.textContent, label: r.getAttribute('aria-label'), cells: [...r.querySelectorAll('[role=gridcell]')].map((c) => c.getAttribute('aria-colindex')).join(',').slice(0, 60) }))
  const mism = []
  for (const r of rows) for (const c of r.querySelectorAll('[role=gridcell][data-ssg-col-key]')) {
    const k = c.getAttribute('data-ssg-col-key'); const ci = Number(c.getAttribute('aria-colindex'))
    const exp = k === 'equipment' ? 2 : k === 'ng' ? 33 : k.startsWith('d') ? Number(k.slice(1)) + 2 : null
    if (exp && exp !== ci) mism.push(`${k}:${ci}!=${exp}`)
  }
  return { rowcount: grid.getAttribute('aria-rowcount'), colcount: grid.getAttribute('aria-colcount'), hdrCount: hdr.length, hdr: hdr.join(' '), mism: mism.slice(0, 8), mismCount: mism.length, rows: rowInfo }
})
;(async () => {
  const { browser, page, logs } = await launch({ viewport: { width: 1100, height: 700 }, locale: 'ja-JP' })
  await page.goto(BASE + '#daily'); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(1000)
  console.log(await shot(page, '14-daily-desktop'))
  let a = await ariaSnap(page)
  console.log('desktop top', { rowcount: a.rowcount, colcount: a.colcount, hdrCount: a.hdrCount, hdr: a.hdr, mism: a.mism })
  console.log(a.rows.filter((r) => r.pane !== 'left').slice(0, 14))
  await page.evaluate(() => { const sc = document.querySelector('.ssg-scroll-container'); sc.scrollLeft = 900; sc.scrollTop = 600 }); await page.waitForTimeout(600)
  a = await ariaSnap(page)
  console.log('desktop scrolled', { rowcount: a.rowcount, hdrCount: a.hdrCount, hdr: a.hdr, mism: a.mism })
  console.log(a.rows.filter((r) => r.pane === 'center').slice(0, 8))
  console.log(await shot(page, '14-daily-desktop-scrolled'))
  // 今日へ
  await page.evaluate(() => { const sc = document.querySelector('.ssg-scroll-container'); sc.scrollLeft = 0; sc.scrollTop = 0 }); await page.waitForTimeout(300)
  await page.click('text=今日(9日)へ'); await page.waitForTimeout(500)
  console.log('goToday', await state(page))
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
