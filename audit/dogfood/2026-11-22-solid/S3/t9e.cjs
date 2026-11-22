const { open, sleep } = require('./lib.cjs')
;(async () => {
  for (const q of ['', '?nomain=1']) {
    const { browser, page } = await open('http://127.0.0.1:5503/' + q)
    await page.waitForSelector('[data-testid=open-dialog]'); await sleep(800)
    await page.click('[data-testid=open-dialog]')
    await page.waitForSelector('[data-testid=dialog-grid] .ssg-body-cell', { timeout: 10000 }); await sleep(1000)
    const dlg = page.locator('[data-testid=dialog]')
    await dlg.locator(`.ssg-body-row[data-pane="center"][data-row-key="P00003"] [data-ssg-col-key="price"]`).click({ button: 'right' }); await sleep(400)
    console.log(q || '(main+dialog)', 'first right-click panels', await page.locator('.ssg-menu-panel').count())
    await browser.close()
  }
})()
