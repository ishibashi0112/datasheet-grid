const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
  const logs = []
  page.on('console', (m) => logs.push(m.type() + ' ' + m.text()))
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  await page.goto('http://localhost:5407/repro-custom.html')
  await page.waitForSelector('[data-pane="center"].ssg-body-row')
  const count = async () => (await page.locator('.ssg-bar--bottom').innerText()).match(/行\s*(\d+)/)?.[1]
  const openFilter = async (colIdx) => {
    const c = page.locator('[data-pane="center"].ssg-body-row').first().locator('[role=gridcell]').nth(colIdx)
    const b = await c.boundingBox()
    await page.mouse.click(b.x + 10, b.y + b.height / 2)
    await page.keyboard.press('Alt+ArrowDown')
    await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター…' }).first().click()
    await page.waitForSelector('.ssg-filter-popover')
    await wait(400)
  }
  // dateSet: 過去 1 時間
  await openFilter(1)
  await page.locator('.ssg-filter-popover button', { hasText: '過去 1 時間' }).click()
  await wait(500)
  console.log('dateSet 過去 1 時間 → rows', await count(), '(期待 7 前後 = 10 分おき)')
  await page.screenshot({ path: 'shots/repro-custom-dateset.png' })
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__grid.current.applyState({ filters: { columnFilters: {} } }))
  await wait(300)
  // custom の画面
  await openFilter(2)
  console.log('custom popover text:', JSON.stringify(await page.locator('.ssg-filter-popover').innerText()))
  console.log('custom popover inputs:', await page.locator('.ssg-filter-popover input').count())
  await page.screenshot({ path: 'shots/repro-custom-custom.png' })
  const inp = page.locator('.ssg-filter-popover input').first()
  if (await inp.count()) {
    await inp.fill('60')
    await page.keyboard.press('Enter')
    await wait(500)
    console.log('custom typed 60 → rows', await count(), 'filterFn received', JSON.stringify((await page.evaluate(() => window.__customValues ?? [])).slice(-2)), 'state', JSON.stringify(await page.evaluate(() => window.__grid.current.getState().filters.columnFilters)))
  }
  await page.keyboard.press('Escape')
  // applyState で custom の値を数値で渡す
  await page.evaluate(() => window.__grid.current.applyState({ filters: { columnFilters: { ms: { kind: 'custom', value: 60 } } } }))
  await wait(400)
  console.log('applyState custom value 60 → rows', await count())
  // dateSet の列に custom の値を入れると?
  await page.evaluate(() => window.__grid.current.applyState({ filters: { columnFilters: { ts: { kind: 'custom', value: 60 } } } }))
  await wait(400)
  console.log('dateSet column given custom kind → rows', await count(), JSON.stringify(await page.evaluate(() => window.__grid.current.getState().filters.columnFilters)))
  console.log(logs.join('\n'))
  await browser.close()
})()
