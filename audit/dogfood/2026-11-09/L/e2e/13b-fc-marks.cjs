const { launch, shot, BASE } = require('./lib.cjs')
const { revealRow } = require('./helpers.cjs')
;(async () => {
  for (const fc of ['none', 'active']) {
    const { browser, page } = await launch({ viewport: { width: 1000, height: 640 }, locale: 'ja-JP', forcedColors: fc })
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollTop = 36 * 10 }); await page.waitForTimeout(400)
    console.log(await shot(page, `13b-fc-${fc}-marks`))
    const info = await page.evaluate(() => {
      const inv = document.querySelector('.ssg-body-cell--invalid')
      const cs = getComputedStyle(inv); const a = getComputedStyle(inv, '::after'); const b = getComputedStyle(inv, '::before')
      const cb = document.querySelector('[role=checkbox][aria-checked=true]')
      const ccs = cb ? getComputedStyle(cb) : null
      return { invBg: cs.backgroundColor, after: `${a.content} bg=${a.backgroundColor} bt=${a.borderTopColor} br=${a.borderRightColor} w=${a.width}`, before: `${b.content} bg=${b.backgroundColor} bt=${b.borderTopColor}`, cbBg: ccs?.backgroundColor, cbBorder: ccs?.borderColor, cbFca: ccs?.forcedColorAdjust }
    })
    console.log(fc, info)
    await browser.close()
  }
})()
