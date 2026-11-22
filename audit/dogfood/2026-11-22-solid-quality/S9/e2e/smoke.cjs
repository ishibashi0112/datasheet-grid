const { open, shot } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5509/'
  const { browser, page, logs } = await open(url)
  await shot(page, 'smoke')
  console.log(await page.evaluate(() => [...document.querySelectorAll('.ssg-total-row')].map((e) => e.textContent).join(' | ')))
  console.log(logs.join('\n'))
  await browser.close()
})()
