const { open, shot } = require('./lib.cjs')
const st = (page) => page.evaluate(() => {
  const sc = document.querySelector('[aria-label="在庫"].ssg-scroll-container')
  if (!sc) return 'no grid'
  const root = sc.closest('.ssg-root')
  const s = sc.getBoundingClientRect()
  const rowEl = [...root.querySelectorAll('[role=row][aria-rowindex="501"]')][0]
  const rb = rowEl?.getBoundingClientRect()
  const bar = root.querySelector('.ssg-bar--bottom')?.textContent.match(/セル\s*\S+/)?.[0]
  return { scrollTop: sc.scrollTop, row501: rb ? { top: Math.round(rb.top), inView: rb.top >= s.top + 30 && rb.bottom <= s.bottom } : 'not rendered', bar, active: document.activeElement.className.toString().slice(0, 30) }
})
;(async () => {
  for (const tabs of ['force', 'unmount']) for (const jump of ['a', 'b', 'c']) {
    const { browser, page, logs } = await open(`?jump=${jump}${tabs === 'unmount' ? '&tabs=unmount' : ''}`)
    await page.waitForTimeout(800)
    await page.click('[data-testid=jump-sku]')
    await page.waitForTimeout(600)
    console.log(`[${tabs}/${jump}]`, JSON.stringify(await st(page)))
    if (jump === 'b' && tabs === 'force') await shot(page, 'jump-force-b', { clip: { x: 0, y: 180, width: 1440, height: 500 } })
    const l = logs.filter((x) => !x.includes('React DevTools'))
    if (l.length) console.log('logs:', l.join('\n'))
    await browser.close()
  }
})()
