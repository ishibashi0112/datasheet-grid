const { open, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open('http://127.0.0.1:5503/?nomain=1')
  await page.waitForSelector('[data-testid=open-dialog]'); await sleep(800)
  await page.click('[data-testid=open-dialog]')
  await page.waitForSelector('[data-testid=dialog-grid] .ssg-body-cell', { timeout: 10000 }); await sleep(1000)
  for (const [k, delay] of [['P00003', 30], ['P00004', 0], ['P00005', 30], ['P00006', 80], ['P00007', 0]]) {
    const c = page.locator(`[data-testid=dialog] .ssg-body-row[data-pane="center"][data-row-key="${k}"] [data-ssg-col-key="price"]`)
    await c.click({ button: 'right', delay }); await sleep(400)
    const n = await page.locator('.ssg-menu-panel').count()
    console.log(k, 'delay', delay, 'panels', n)
    if (n) { await page.keyboard.press('Escape'); await sleep(200) }
  }
  console.log('dialog open', await page.evaluate(() => document.querySelector('dialog').open))
  await browser.close()
})()
