const { open, shot } = require('./lib.cjs')
;(async () => {
  for (const scale of ['1', '0.8']) {
    const { browser, page } = await open('?scale=' + scale)
    await page.locator('[data-testid=scale-section]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const r = await page.evaluate(() => { const root = document.querySelector('[data-testid=scale-section] .ssg-root'); const b = root.getBoundingClientRect(); const box = document.querySelector('[data-testid=scale-box]').parentElement.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, boxB: box.bottom, rootB: b.bottom } })
    console.log(scale, JSON.stringify(r))
    await shot(page, `scale-bottom-${scale}`, { clip: { x: r.x, y: r.y + r.h - 110, width: 700, height: 120 } })
    await browser.close()
  }
})()
