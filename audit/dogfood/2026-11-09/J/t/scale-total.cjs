const { open, shot } = require('./lib.cjs')
;(async () => {
  for (const scale of ['1', '0.8', '0.6']) {
    const { browser, page } = await open('?scale=' + scale)
    await page.locator('[data-testid=scale-section]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const r = await page.evaluate(() => {
      const root = document.querySelector('[data-testid=scale-section] .ssg-root')
      const sc = root.querySelector('.ssg-scroll-container')
      const tot = [...root.querySelectorAll('[role=row]')].filter((r) => /合計/.test(r.textContent))
      const s = sc.getBoundingClientRect()
      return { scBottom: +s.bottom.toFixed(1), scClientH: sc.clientHeight, scOffsetH: sc.offsetHeight, scrollbarH: sc.offsetHeight - sc.clientHeight, totals: tot.map((t) => { const b = t.getBoundingClientRect(); return [+b.top.toFixed(1), +b.bottom.toFixed(1), t.className.slice(0, 40)] }) }
    })
    console.log(scale, JSON.stringify(r))
    await browser.close()
  }
})()
