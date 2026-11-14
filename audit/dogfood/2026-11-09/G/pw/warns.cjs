const { open, wait, waitCountChange } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://localhost:5407/')
  await wait(800)
  const n0 = logs.length
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['FATAL'] } } } }))
    await wait(800)
    await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {} } }))
    await wait(800)
  }
  // 展開してから絞り込みを外す
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['FATAL'] } } } }))
  await wait(800)
  await page.locator('[data-pane="left"].ssg-body-row [aria-expanded]').first().click()
  await wait(300)
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {} } }))
    await wait(800)
    await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['FATAL'] } } } }))
    await wait(800)
  }
  const extra = logs.slice(n0).filter((l) => !l.includes('[vite]'))
  const counts = {}
  for (const l of extra) { const k = l.slice(0, 60); counts[k] = (counts[k] ?? 0) + 1 }
  console.log(JSON.stringify(counts, null, 1))
  await browser.close()
})()
