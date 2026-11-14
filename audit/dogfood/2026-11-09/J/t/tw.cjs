const { open } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open()
  console.log(await page.evaluate(() => { const r = document.querySelector('[data-testid=sales-wrap] .ssg-root'); const cs = getComputedStyle(r); return { cls: r.className, radius: cs.borderRadius, borderLeft: cs.borderLeftWidth, borderBottom: cs.borderBottomWidth } }))
  await browser.close()
})()
