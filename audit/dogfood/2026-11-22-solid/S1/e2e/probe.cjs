const { open } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open(`${process.env.BASE || 'http://localhost:5501/'}?tab=signal`)
  console.log(await page.evaluate(() => document.querySelector('[role="row"][aria-rowindex="5"]').outerHTML.slice(0, 900)))
  await browser.close()
})()
