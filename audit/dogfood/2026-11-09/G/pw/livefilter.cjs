const { open, shot, wait, startJank, stopJank, rowCount, clickVisible } = require('./lib.cjs')
;(async () => {
  const url = (process.argv[2] ?? 'http://localhost:5407/') + '?live=1'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(1500)
  // 1) ライブ中のグローバルフィルター
  await startJank(page)
  const input = page.locator('.ssg-bar--top input')
  await input.fill('circuit breaker')
  const samples = []
  const t = Date.now()
  for (let i = 0; i < 40; i++) {
    await wait(500)
    samples.push({ s: Math.round((Date.now() - t) / 100) / 10, count: await rowCount(page), status: await page.evaluate(() => { const r = document.querySelector('.ssg-root'); return /フィルター中|適用中|filtering|%/.test(r.innerText.slice(0, 400)) ? 'busy' : '' }), total: await page.locator('.toolbar .muted').first().innerText() })
  }
  console.log('live + global filter samples', JSON.stringify(samples.filter((_, i) => i % 4 === 0)))
  console.log('jank', JSON.stringify(await stopJank(page)))
  await shot(page, `livefilter-${tag}-global`)
  await input.fill('')
  await wait(2000)
  // 2) ライブ中のセル内検索
  await clickVisible(page, 2, 'center', 1)
  await page.keyboard.press('Control+f')
  await page.locator('.ssg-find-bar input').fill('zzz-nohit')
  const fs = []
  const t2 = Date.now()
  for (let i = 0; i < 24; i++) {
    await wait(500)
    fs.push(Math.round((Date.now() - t2) / 100) / 10 + 's:' + (await page.locator('.ssg-find-bar').innerText()).replace(/\s+/g, ' ').slice(0, 20))
  }
  console.log('live + find', fs.join(' | '))
  await page.keyboard.press('Escape')
  // 3) ライブ中の列フィルター(set)
  await startJank(page)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['ERROR', 'FATAL'] } } } }))
  await wait(5000)
  console.log('live + set filter: count', await rowCount(page), 'jank 5s', JSON.stringify(await stopJank(page)))
  // 4) ライブ中のソート(新しい順)
  await startJank(page)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {} }, sort: [{ columnKey: 'ts', direction: 'desc' }] }))
  await wait(5000)
  console.log('live + sort desc: jank 5s', JSON.stringify(await stopJank(page)), 'first row', await page.locator('[data-pane="left"].ssg-body-row').first().locator('[role=gridcell]').nth(1).innerText())
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
