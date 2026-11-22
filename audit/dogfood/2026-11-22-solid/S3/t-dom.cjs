const { open, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(800)
  const html = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ssg-body-row')].slice(0, 4)
    return rows.map((r) => r.outerHTML.slice(0, 1500)).join('\n-----\n')
  })
  console.log(html)
  const hdr = await page.evaluate(() => [...document.querySelectorAll('.ssg-header-cell')].map((h) => `${h.getAttribute('data-pane')||''} ${h.getAttribute('aria-colindex')} ${h.textContent}`).join(' | '))
  console.log(hdr)
  await browser.close()
})()
