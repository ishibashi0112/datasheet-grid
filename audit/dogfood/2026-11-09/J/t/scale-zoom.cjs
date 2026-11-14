const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open('?scale=0.8', { dsf: Number(process.argv[2] || 3) })
  await page.locator('[data-testid=scale-section]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const root = document.querySelector('[data-testid=scale-section] .ssg-root')
    const sc = root.querySelector('.ssg-scroll-container')
    const kids = [...root.children].map((c) => { const b = c.getBoundingClientRect(); return `${c.className.slice(0, 40)} ${b.top.toFixed(1)}-${b.bottom.toFixed(1)}` })
    return { kids, sc: sc.getBoundingClientRect().bottom }
  })
  console.log(JSON.stringify(r, null, 1))
  const b = await page.locator('[data-testid=scale-section] .ssg-total-row').first().boundingBox()
  await shot(page, 'scale-zoom-' + (process.argv[2] || 3), { clip: { x: b.x, y: b.y - 10, width: 400, height: 50 } })
  await browser.close()
})()
