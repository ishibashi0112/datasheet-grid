const { open, wait, shot } = require('./lib.cjs')
;(async () => {
  for (const rows of ['1000000', '20000']) {
    const { browser, page } = await open('http://localhost:5407/?rows=' + rows)
    await wait(800)
    // 長い SQL メッセージのセルを探してホバー
    const pos = await page.evaluate(() => {
      const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
      const cells = [...document.querySelectorAll('[data-pane="center"].ssg-body-row [role=gridcell]')].filter((c) => c.textContent.startsWith('SQL SELECT') && c.getBoundingClientRect().top > sc.top + 40)
      const c = cells[0]
      const b = c.getBoundingClientRect()
      return { x: b.left + 100, y: b.top + b.height / 2, overflowAttr: c.hasAttribute('data-ssg-tooltip-overflow') || !!c.querySelector('[data-ssg-tooltip-overflow]'), sw: c.scrollWidth, cw: c.clientWidth, cls: c.className }
    })
    await page.mouse.move(pos.x, pos.y)
    await wait(1200)
    const tip = await page.evaluate(() => { const t = document.querySelector('.ssg-tooltip'); return t ? { text: t.textContent.slice(0, 80), visible: getComputedStyle(t).opacity !== '0' && getComputedStyle(t).visibility !== 'hidden' } : null })
    console.log(rows, JSON.stringify(pos), 'tooltip', JSON.stringify(tip))
    await shot(page, 'tooltip-' + rows)
    await browser.close()
  }
})()
