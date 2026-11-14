const { launch, BASE, SHOTS } = require('./lib.cjs')
const path = require('path')
;(async () => {
  for (const fc of ['none', 'active']) {
    const { browser, page } = await launch({ viewport: { width: 1000, height: 640 }, locale: 'ja-JP', forcedColors: fc })
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollTop = 36 * 18 }); await page.waitForTimeout(400)
    const b = await page.evaluate(() => { const c = document.querySelector('.ssg-body-row[aria-rowindex="24"] [data-ssg-col-key=photo]'); const r = c.getBoundingClientRect(); return { x: r.x - 220, y: r.y - 40, width: 320, height: 120, cls: c.className } })
    console.log(fc, b.cls)
    await page.screenshot({ path: path.join(SHOTS, `13c-fc-${fc}-invalid.png`), clip: { x: b.x, y: b.y, width: b.width, height: b.height } })
    await browser.close()
  }
})()
