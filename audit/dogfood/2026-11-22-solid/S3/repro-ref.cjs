// ref の順番の最小再現を開いて記録を出す: node repro-ref.cjs [query]
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open(`http://127.0.0.1:5503/ref.html${process.argv[2] ?? ''}`)
  await sleep(1500)
  await page.evaluate(() => window.__add()).catch((e) => logs.push('add failed ' + e.message))
  await sleep(500)
  console.log((await page.evaluate(() => window.__log)).join('\n'))
  console.log('count div:', await page.locator('[data-testid=count]').textContent())
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
