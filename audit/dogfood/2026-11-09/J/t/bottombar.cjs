const { open, shot } = require('./lib.cjs')
const { cellPos } = require('./dlib.cjs')
const ORD = '[data-testid=orders-wrap]'
;(async () => {
  const { browser, page, logs } = await open()
  await page.locator('[data-testid=split-section]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const a = await cellPos(page, 0, '金額', ORD), b = await cellPos(page, 3, '金額', ORD)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up()
  await page.waitForTimeout(500)
  for (const dx of [0, -200, -350, -450]) {
    if (dx) {
      const h = await page.locator('[data-testid=split-handle]').boundingBox()
      await page.mouse.move(h.x + 4, h.y + 100); await page.mouse.down(); await page.mouse.move(h.x + 4 + (dx === -200 ? -200 : -150 + (dx === -350 ? 0 : -100) + 0), h.y + 100, { steps: 8 }); await page.mouse.up()
      await page.waitForTimeout(400)
    }
    const info = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid=orders-wrap] .ssg-bar--bottom')
      const r = bar.getBoundingClientRect()
      const parts = [...bar.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => { const b = e.getBoundingClientRect(); return `${e.textContent.trim()}[${Math.round(b.left - r.left)}..${Math.round(b.right - r.left)}${e.scrollWidth > e.clientWidth + 1 ? ' clipped' : ''}]` })
      return { w: Math.round(r.width), h: Math.round(r.height), parts }
    })
    console.log(JSON.stringify(info))
    const bb = await page.locator(`${ORD} .ssg-bar--bottom`).boundingBox()
    await shot(page, `bottombar-${info.w}`, { clip: { x: bb.x, y: bb.y - 4, width: bb.width, height: bb.height + 8 } })
  }
  await browser.close()
})()
