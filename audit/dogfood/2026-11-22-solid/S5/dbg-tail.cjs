const { open, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/${process.argv[2] ?? '?n=20000&tail'}`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 120000 })
  await sleep(2500)
  console.log(JSON.stringify(await page.evaluate(() => ({ hasGrid: !!window.__logGrid, count: document.querySelector('[data-testid=logcount]')?.textContent, following: document.querySelector('[data-testid=following]')?.textContent }))))
  console.log(logs.join('\n').slice(0, 3000))
  await browser.close()
})()
