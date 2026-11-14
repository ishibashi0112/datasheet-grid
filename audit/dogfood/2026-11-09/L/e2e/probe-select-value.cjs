const { launch, BASE } = require('./lib.cjs')
const { cellCenter } = require('./helpers.cjs')
;(async () => {
  const { browser, page } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  const c = await cellCenter(page, 0, 'result'); await page.mouse.click(c.x, c.y); await page.keyboard.press('Enter'); await page.waitForTimeout(400)
  for (let i = 0; i < 3; i++) {
    console.log(await page.evaluate(() => ({ v: document.querySelector('.ssg-cell-editor-input').value, sel: [...document.querySelectorAll('[role=option]')].findIndex((o) => o.getAttribute('aria-selected') === 'true') })))
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  console.log('after esc cell text', await page.evaluate(() => document.querySelector('.ssg-body-row[aria-rowindex="2"] [data-ssg-col-key=result]').textContent))
  await browser.close()
})()
