const { launch, BASE, texts } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await launch()
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'shot-desktop.png' })
  // 1 行目を展開
  const tg = page.locator('.ssg-body-row[data-row-index="0"] button[aria-expanded]').first()
  console.log('toggle', await tg.count(), await tg.getAttribute('aria-label').catch(() => null))
  if (await tg.count()) { await tg.click(); await page.waitForTimeout(500) }
  await page.screenshot({ path: 'shot-desktop-detail.png' })
  console.log(logs.join('\n'))
  await browser.close()
})()
