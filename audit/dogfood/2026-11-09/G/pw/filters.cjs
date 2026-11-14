const { open, shot, wait, startJank, stopJank, clickCell, rowCount, waitCountChange, openColumnFilter } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  let c = await rowCount(page)
  console.log('initial', c)
  // 1) レベル: DEBUG と INFO を外す
  await openColumnFilter(page, 0)
  for (const name of ['DEBUG', 'INFO']) {
    await startJank(page)
    await page.locator('.ssg-filter-popover label', { hasText: name }).first().click()
    const r = await waitCountChange(page, c)
    c = r.count
    console.log('level uncheck', name, r, await stopJank(page))
  }
  await shot(page, `flt-${tag}-level`)
  await page.locator('.ssg-filter-popover button', { hasText: '閉じる' }).click()
  await wait(300)
  console.log('filter state', JSON.stringify(await page.evaluate(() => window.__grid.getState().filters)))
  // 2) サービス: 検索欄に "che" → Enter
  await openColumnFilter(page, 1)
  await page.locator('.ssg-filter-popover input[type=text], .ssg-filter-popover input:not([type])').first().fill('che')
  await startJank(page)
  await page.keyboard.press('Enter')
  let r = await waitCountChange(page, c)
  c = r.count
  console.log('service search Enter', r, await stopJank(page))
  await shot(page, `flt-${tag}-service`)
  await page.keyboard.press('Escape')
  await wait(300)
  console.log('filter state', JSON.stringify(await page.evaluate(() => window.__grid.getState().filters)))
  // 3) 時刻: dateSet のプリセット
  await openColumnFilter(page, -1).catch(() => {})
  console.log('popover count', await page.locator('.ssg-filter-popover').count())
  await page.keyboard.press('Escape')
  await wait(200)
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).join('\n'))
  await browser.close()
})()
