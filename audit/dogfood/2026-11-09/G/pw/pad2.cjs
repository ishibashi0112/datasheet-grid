const { open, wait } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open('http://localhost:5407/?rows=20000&density=standard&padfix=1')
  await wait(800)
  await page.evaluate(() => window.__grid.applyState({ filters: { globalText: 'u-' } }))
  await wait(1500)
  const sc = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(sc.x + 700, sc.y + 300)
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 400); await wait(50) }
  await wait(500)
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-pane="center"].ssg-body-row')].slice(0, 30).map((r) => {
      const c = r.querySelector('.ssg-body-cell--autoheight'); const ct = c?.querySelector('.ssg-autoheight-content')
      return c ? Math.round(r.getBoundingClientRect().height) + ':' + Math.round(ct.getBoundingClientRect().height) + ':' + Math.round(ct.scrollHeight) : null
    })
    return rows
  })
  console.log('row h : content h : content scrollH', m.join(' '))
  await page.screenshot({ path: 'shots/pad-fix.png', clip: { x: 300, y: 120, width: 1000, height: 300 } })
  await browser.close()
})()
