const { open, sleep } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://127.0.0.1:5505/'
  const t0 = Date.now()
  const { browser, page, logs } = await open(url)
  await page.waitForSelector('.ssg-body-cell', { timeout: 120000 })
  console.log('first cell after', Date.now() - t0, 'ms; gen', await page.evaluate(() => Math.round(window.__genMs)))
  await sleep(2000)
  await page.screenshot({ path: __dirname + '/shots/t1-logs.png' })
  console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'))
  await browser.close()
})()
