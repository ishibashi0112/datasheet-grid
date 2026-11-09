const { open, wait, clickVisible } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open((process.argv[2] ?? 'http://localhost:5407/') + '?live=1')
  await wait(1500)
  await page.locator('.toolbar input[type=checkbox]').nth(1).uncheck()
  await clickVisible(page, 2, 'center', 1)
  await page.keyboard.press('Control+f')
  await page.locator('.ssg-find-bar input').fill('circuit breaker')
  const fs = []
  const t = Date.now()
  for (let i = 0; i < 20; i++) { await wait(1000); fs.push(Math.round((Date.now() - t) / 1000) + 's:' + (await page.locator('.ssg-find-bar').innerText()).replace(/\s+/g, ' ').slice(0, 16)) }
  console.log('live + find (prod?)', fs.join(' | '))
  await browser.close()
})()
