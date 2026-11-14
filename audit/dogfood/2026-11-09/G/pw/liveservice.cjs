const { open, wait, clickVisible } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open('http://localhost:5407/?live=1')
  await wait(1500)
  await page.locator('.toolbar input[type=checkbox]').nth(1).uncheck()
  await clickVisible(page, 2, 'center', 1)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForSelector('.ssg-menu-panel')
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター…' }).first().click()
  await page.waitForSelector('.ssg-filter-popover')
  const out = []
  const t = Date.now()
  for (let i = 0; i < 15; i++) { await wait(1000); out.push(Math.round((Date.now() - t) / 1000) + 's:' + (await page.locator('.ssg-filter-popover').innerText()).replace(/\s+/g, ' ').slice(0, 30)) }
  console.log('live + service set popover', out.join(' | '))
  // 一度開き終わった後(ライブを止めて)→ 再開して開き直す
  await page.keyboard.press('Escape')
  await browser.close()
})()
