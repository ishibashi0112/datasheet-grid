const { open, shot, wait } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open('http://localhost:5407/?rows=20000')
  await wait(500)
  const r = await page.evaluate(() => {
    const out = []
    for (const [x, y] of [[1376, 145], [1376, 400], [1372, 145], [1380, 145]]) {
      const el = document.elementFromPoint(x, y)
      out.push({ x, y, tag: el?.tagName, cls: String(el?.className).slice(0, 80) })
    }
    const sc = document.querySelector('.ssg-scroll-container')
    const st = getComputedStyle(sc)
    return { out, overflowY: st.overflowY, scrollbarWidth: st.scrollbarWidth, w: sc.offsetWidth, cw: sc.clientWidth, rect: sc.getBoundingClientRect().toJSON() }
  })
  console.log(JSON.stringify(r, null, 1))
  await page.screenshot({ path: 'shots/sb-zoom.png', clip: { x: 1300, y: 50, width: 100, height: 300 } })
  await browser.close()
})()
