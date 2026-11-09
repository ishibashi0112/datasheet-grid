const { open, shot, wait, rowCount, waitCountChange, openFilterAt } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://localhost:5407/')
  await wait(800)
  await openFilterAt(page, 'left', 1)
  await page.waitForFunction(() => !document.querySelector('.ssg-filter-popover')?.innerText.includes('収集中'), null, { timeout: 60000 })
  // ツリーを開く: ▸ を順に押す
  for (let i = 0; i < 2; i++) {
    const tg = page.locator('.ssg-filter-popover button', { hasText: '▸' }).first()
    if (await tg.count()) { await tg.click(); await wait(200) }
  }
  const txt = await page.locator('.ssg-filter-popover').innerText()
  console.log('tree text:', JSON.stringify(txt.slice(txt.indexOf('値'), txt.indexOf('値') + 300)))
  await shot(page, 'datetree')
  // 最初の日のチェックを外す
  const c0 = await rowCount(page)
  const day = page.locator('.ssg-filter-popover').getByText('2 日', { exact: true })
  console.log('day elements', await day.count(), await day.first().evaluate((e) => e.outerHTML.slice(0, 200)))
  await day.first().click()
  const r = await waitCountChange(page, c0)
  console.log('uncheck 2 日', r, JSON.stringify(await page.evaluate(() => window.__grid.getState().filters.columnFilters.ts)))
  const row = day.first().locator('xpath=..')
  console.log('day row html', await row.evaluate((e) => e.outerHTML.slice(0, 400)))
  const cb = row.locator('input[type=checkbox]')
  console.log('checkbox count', await cb.count(), 'checked', await cb.first().isChecked())
  await cb.first().click()
  const r2 = await waitCountChange(page, c0)
  console.log('click checkbox of 2 日', r2, JSON.stringify(await page.evaluate(() => window.__grid.getState().filters.columnFilters.ts)))
  // 月の文字を押すと?
  const c1 = await rowCount(page)
  await page.locator('.ssg-filter-popover').getByText('11 月', { exact: true }).click()
  await wait(1500)
  console.log('click text 11 月 → count', await rowCount(page), 'was', c1)
  await shot(page, 'datetree-after')
  await page.keyboard.press('Escape')
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 10).join('\n'))
  await browser.close()
})()
