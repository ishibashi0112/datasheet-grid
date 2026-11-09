const { open, shot } = require('./lib.cjs')
;(async () => {
  for (const dsf of [1.25, 1.5]) {
    const { browser, page } = await open('', { dsf, viewport: { width: 1280, height: 800 } })
    // 少しスクロールして端数の位置にする
    await page.evaluate(() => { const sc = document.querySelector('[aria-label="売上明細"].ssg-scroll-container'); sc.scrollTop = 1234.5; })
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const root = document.querySelector('[aria-label="売上明細"]').closest('.ssg-root')
      const rows = [...root.querySelectorAll('[role=row][aria-rowindex="40"]')].map((e) => { const b = e.getBoundingClientRect(); return [+b.top.toFixed(3), +b.height.toFixed(3), e.closest('[data-pane]')?.getAttribute('data-pane')] })
      const heads = [...root.querySelectorAll('[role=row][aria-rowindex="1"]')].map((e) => { const b = e.getBoundingClientRect(); return [+b.top.toFixed(3), +b.height.toFixed(3)] })
      return { rows, heads }
    })
    console.log(dsf, JSON.stringify(r))
    const b = await page.locator('[aria-label="売上明細"].ssg-scroll-container').boundingBox()
    await shot(page, `dpr-${dsf}-left`, { clip: { x: b.x, y: b.y - 45, width: 420, height: 240 } })
    await shot(page, `dpr-${dsf}-right`, { clip: { x: b.x + b.width - 420, y: b.y - 45, width: 420, height: 240 } })
    await browser.close()
  }
})()
