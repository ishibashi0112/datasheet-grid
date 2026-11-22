const { launch, BASE, openColumnMenu } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await launch()
  const full = []
  page.on('console', (m) => { if (/STRICT_READ|RELAY/.test(m.text())) full.push(m.text()) })
  await page.goto(BASE + '/users')
  await page.waitForSelector('.ssg-body-row:not([data-skeleton-row])')
  await openColumnMenu(page, 'logins')
  await page.locator('[role="menu"] .ssg-menu-item', { hasText: 'Sort descending' }).click()
  await page.waitForTimeout(1500)
  console.log(full.slice(0, 3).join('\n------\n'))
  await browser.close()
})()
