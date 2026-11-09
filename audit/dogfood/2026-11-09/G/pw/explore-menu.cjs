const { open, shot, wait, clickCell } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await clickCell(page, 1, 0) // レベル列(中央ペインの最初)
  await page.keyboard.press('Alt+ArrowDown')
  await wait(400)
  const items = await page.locator('.ssg-menu-panel .ssg-menu-item').allInnerTexts()
  console.log('menu items', items)
  await shot(page, 'menu-level')
  // フィルター項目を探して押す
  const filterItem = page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター' }).first()
  console.log('filter item text', await filterItem.innerText())
  await filterItem.click()
  await wait(600)
  await shot(page, 'filter-level-open')
  const pop = await page.evaluate(() => {
    const el = [...document.body.children].filter((e) => e.className && String(e.className).includes('ssg')).map((e) => e.className)
    return el
  })
  console.log('body ssg children', pop)
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).join('\n'))
  await browser.close()
})()
