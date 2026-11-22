const { open, cell, clickCell, rows, shot } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5509/'
  const { browser, page, logs } = await open(url)
  const bar = () => page.evaluate(() => document.querySelector('.ssg-bar--bottom')?.textContent)
  for (const key of ['date', 'account', 'amount', 'taxType', 'tax', 'people', 'memo', 'receipt']) {
    const a = await cell(page, 0, key)
    const b = await cell(page, 5, key)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    console.log(key, await bar())
  }
  await browser.close()
})()
