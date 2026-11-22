const { open, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/?grid=nofill')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(1000)
  // 選択して右下の四角を探す
  const cell = page.locator('.ssg-body-row[aria-rowindex="3"] .ssg-body-cell').nth(5)
  await cell.click()
  await sleep(300)
  console.log('fill handle elements:', await page.locator('[class*=fill-handle]').count())
  console.log(logs.join('\n'))
  await browser.close()
})()
