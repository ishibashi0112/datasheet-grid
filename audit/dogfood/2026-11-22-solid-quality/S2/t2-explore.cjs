const { launch, BASE, openColumnMenu, texts } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await launch()
  await page.goto(BASE + '/users')
  await page.waitForSelector('.ssg-body-row:not([data-skeleton-row])')
  for (const key of ['name', 'role', 'createdAt', 'logins', 'lastLogin']) {
    await openColumnMenu(page, key)
    await page.locator('[role="menu"] .ssg-menu-item', { hasText: 'Filter…' }).click()
    await page.waitForTimeout(600)
    const html = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      return d ? d.outerHTML.replace(/<!--[^>]*-->/g, '').replace(/<svg.*?<\/svg>/g, '<svg/>').slice(0, 2500) : 'no dialog'
    })
    console.log('=====', key, '\n', html)
    await page.screenshot({ path: `shot-filter-${key}.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  console.log(logs.join('\n'))
  await browser.close()
})()
