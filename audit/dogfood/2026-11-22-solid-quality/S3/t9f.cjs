const { open, sleep } = require('./lib.cjs')
;(async () => {
  for (const q of ['', 'class', 'lite', 'fill', 'find', 'rowdrag', 'rownum', 'lite&class&fill&find&rowdrag&rownum']) {
    const { browser, page } = await open('http://127.0.0.1:5503/?s=dialog&' + q)
    await page.click('[data-testid=open]')
    await page.waitForSelector('dialog .ssg-body-cell', { timeout: 15000 }); await sleep(800)
    await page.locator('dialog .ssg-body-row[data-pane="center"][data-row-key="3"] [data-ssg-col-key="name"]').click({ button: 'right' }); await sleep(400)
    console.log(q || '(base)', 'first right-click panels', await page.locator('.ssg-menu-panel').count())
    await browser.close()
  }
})()
