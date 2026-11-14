const { launch } = require('./lib.cjs')
const URL_ = process.env.MIN || 'http://127.0.0.1:5412/min.html'
;(async () => {
  for (const wait of [0, 0, 50, 200]) {
    const { browser, page } = await launch({ viewport: { width: 1000, height: 700 }, locale: 'ja-JP' })
    await page.goto(URL_); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    await page.evaluate(() => document.querySelector('.ssg-shell').focus())
    await page.keyboard.press('Control+Home'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('F2'); await page.waitForTimeout(300)
    await page.keyboard.press('Escape'); if (wait) await page.waitForTimeout(wait)
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(100)
    const act = await page.evaluate(() => { const s = document.querySelector('.ssg-shell'); const c = document.getElementById(s.getAttribute('aria-activedescendant')); return c && c.getAttribute('data-ssg-col-key') })
    await page.keyboard.press('F2'); await page.waitForTimeout(300)
    const ae = await page.evaluate(() => document.activeElement.className)
    console.log('wait', wait, 'active after 2x ArrowLeft =', act, 'focus after F2 =', ae)
    await browser.close()
  }
})()
