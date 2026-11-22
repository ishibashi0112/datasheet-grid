// 保存中にグローバルフィルター → 保存の決着を待ってから取り直し、新しい値で出るか
const { launch, BASE, clickCell, chaos, serverLog, clearLog, cell } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await launch()
  await chaos(page, { getFailRate: 0, patchFailRate: 0, getDelay: 50 })
  await page.goto(BASE + '/users')
  await page.locator('.ssg-body-row:not([data-skeleton-row])').first().waitFor()
  await clearLog(page)
  const name = 'Inflight ' + Date.now() % 10000
  await clickCell(page, 5, 'name')
  await page.keyboard.type(name); await page.keyboard.press('Enter')
  await page.locator('input[aria-label="Filter all columns"]').fill('inflight')
  await page.waitForTimeout(2500)
  const rows = await page.evaluate(() => [...document.querySelectorAll('.ssg-body-row:not([data-skeleton-row]) [data-ssg-col-key="name"]')].map((e) => e.textContent))
  console.log(JSON.stringify({ name, rows, log: (await serverLog(page)).map((x) => [x.method, x.t % 100000, x.query?.globalText ?? '']) }))
  console.log(logs.join('\n'))
  await browser.close()
})()
