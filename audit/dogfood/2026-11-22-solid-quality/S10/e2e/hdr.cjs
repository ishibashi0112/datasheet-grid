const { open } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open()
  await page.goto('http://localhost:5510/?link=1')
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  console.log(await page.evaluate(() => document.querySelector('[role=grid][aria-label="Orders"] [role=columnheader][data-ssg-col-key=date]').outerHTML.slice(0, 1500)))
  await browser.close()
})()
