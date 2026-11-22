const { open, sleep } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://127.0.0.1:5503/'
  const { browser, page, logs } = await open(url)
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(1500)
  await page.screenshot({ path: __dirname + '/shots/t1-initial.png' })
  console.log('variant', await page.textContent('[data-testid=variant]'))
  console.log('rows in DOM', await page.locator('.ssg-body-row').count())
  console.log(logs.join('\n'))
  await browser.close()
})()
