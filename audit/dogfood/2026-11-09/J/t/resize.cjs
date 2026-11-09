const { open, shot } = require('./lib.cjs')
const info = (page) => page.evaluate(() => ({
  docW: document.documentElement.scrollWidth, inner: innerWidth,
  grids: [...document.querySelectorAll('.ssg-root')].filter((r) => r.offsetParent).map((r) => { const b = r.getBoundingClientRect(); const p = r.parentElement.getBoundingClientRect(); const sc = r.querySelector('.ssg-scroll-container'); return `${sc.getAttribute('aria-label')}: root ${Math.round(b.width)}x${Math.round(b.height)} parent ${Math.round(p.width)}x${Math.round(p.height)} sc ${sc.clientWidth}/${sc.scrollWidth}` }),
}))
;(async () => {
  const { browser, page, logs } = await open()
  for (const w of [1100, 800, 600, 390, 1440]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(400)
    console.log(w, JSON.stringify(await info(page), null, 0))
    if (w === 600 || w === 390) await shot(page, `resize-${w}`, { fullPage: false })
  }
  // ウィンドウを小刻みに変える(ドラッグで窓を広げる相当)
  for (let w = 900; w <= 1400; w += 25) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(16) }
  await page.waitForTimeout(400)
  console.log('after sweep', JSON.stringify(await info(page)))
  const l = logs.filter((x) => !x.includes('React DevTools'))
  if (l.length) console.log('logs:', l.join('\n'))
  await browser.close()
})()
