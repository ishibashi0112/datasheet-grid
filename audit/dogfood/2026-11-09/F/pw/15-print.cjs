const { open, shot } = require('./lib.cjs')
const path = require('path')
;(async () => {
  for (const q of ['', '?extra=30']) {
    const { browser, page, logs } = await open(q, { viewport: { width: 1000, height: 800 } })
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(500)
    await shot(page, '15-print' + (q ? '-extra' : ''), { fullPage: true })
    const info = await page.evaluate(() => ({
      bodyH: document.body.scrollHeight,
      renderedRows: document.querySelectorAll('.ssg-body-row[data-pane="center"]').length,
      gridH: document.querySelector('.ssg-root').getBoundingClientRect().height,
    }))
    console.log(q, JSON.stringify(info))
    await page.pdf({ path: path.join(__dirname, '..', 'shots', '15-print' + (q ? '-extra' : '') + '.pdf'), format: 'A4' })
    console.log(logs)
    await browser.close()
  }
})()
