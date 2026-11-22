const { open } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open('http://localhost:5501/min-tw.html')
  console.log(await page.evaluate(() => {
    const r = getComputedStyle(document.querySelector('.ssg-root'))
    const c = getComputedStyle(document.querySelector('.ssg-body-cell'))
    return { radius: r.borderTopLeftRadius, bw: r.borderTopWidth, bc: r.borderTopColor, cellColor: c.color, boxSizing: getComputedStyle(document.querySelector('.ssg-body-cell')).boxSizing }
  }))
  await browser.close()
})()
