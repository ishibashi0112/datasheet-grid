const { open, shot, wait, startJank, stopJank, rowCount, waitCountChange, openFilterAt } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  let c = await rowCount(page)
  // 左ペインのセル: [展開トグル, 時刻] ? 確かめる
  const leftCells = await page.locator('[data-pane="left"].ssg-body-row').first().locator('[role=gridcell]').allInnerTexts()
  console.log('left cells', leftCells)
  await startJank(page)
  const t0 = Date.now()
  await openFilterAt(page, 'left', leftCells.length - 1)
  await shot(page, `date-${tag}-collecting`)
  let txt = ''
  for (let i = 0; i < 1200; i++) { txt = await page.locator('.ssg-filter-popover').innerText(); if (!txt.includes('収集中')) break; await wait(50) }
  console.log('collect ms', Date.now() - t0, JSON.stringify(await stopJank(page)))
  await shot(page, `date-${tag}-open`)
  const texts = await page.locator('.ssg-filter-popover').innerText()
  console.log('popover text:\n' + texts.slice(0, 600))
  for (const preset of ['今日', '昨日', '過去 7 日', '過去 30 日']) {
    const btn = page.locator('.ssg-filter-popover button', { hasText: preset }).first()
    if (!(await btn.count())) { console.log('no preset', preset); continue }
    await startJank(page)
    await btn.click()
    const r = await waitCountChange(page, c, 15000)
    if (r.count !== null) c = r.count
    console.log('preset', preset, r, JSON.stringify(await page.evaluate(() => window.__grid.getState().filters.columnFilters.ts)), JSON.stringify(await stopJank(page)))
    await shot(page, `date-${tag}-${preset}`)
  }
  // 範囲: 日付を入れる
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).join('\n'))
  await browser.close()
})()
