const { open, wait } = require('./lib.cjs')
;(async () => {
  for (const d of ['compact', 'standard']) {
    const { browser, page } = await open('http://localhost:5407/?rows=20000&density=' + d)
    await wait(800)
    await page.evaluate(() => window.__grid.applyState({ filters: { globalText: '接続プール' } }))
    await wait(1500)
    const m = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.ssg-body-cell--autoheight')].find((x) => x.querySelector('.ssg-autoheight-content')?.getBoundingClientRect().height > 30)
      const cb = c.getBoundingClientRect(); const ib = c.querySelector('.ssg-autoheight-content').getBoundingClientRect()
      return { y: cb.top, contentTopGap: Math.round(ib.top - cb.top), contentBottomGap: Math.round(cb.bottom - ib.bottom), rowH: Math.round(cb.height), padding: getComputedStyle(c).padding }
    })
    console.log(d, JSON.stringify(m))
    await page.screenshot({ path: `shots/pad-${d}.png`, clip: { x: 300, y: m.y - 40, width: 1000, height: 160 } })
    await browser.close()
  }
})()
