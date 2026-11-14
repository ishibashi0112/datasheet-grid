const { open, shot, wait, startJank, stopJank, clickCell } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await clickCell(page, 1, 1)
  await page.keyboard.press('Control+f')
  await wait(300)
  const fb = await page.locator('.ssg-find-bar').count()
  console.log('find bar', fb, 'focused tag', await page.evaluate(() => document.activeElement?.tagName + ' ' + document.activeElement?.getAttribute('aria-label')))
  for (const q of ['u-31337', 'circuit breaker', 'zzzz-nohit', '在庫の同期', 'd73eb438a907d090']) {
    await page.evaluate(() => { window.__findEvents = [] })
    const input = page.locator('.ssg-find-bar input')
    await input.fill('')
    await startJank(page)
    const t = Date.now()
    await page.keyboard.type(q, { delay: 30 })
    const typedAt = Date.now() - t
    // 検索中が終わるまで待つ
    let txt = ''
    for (let i = 0; i < 600; i++) {
      txt = await page.locator('.ssg-find-bar').innerText()
      if (!txt.includes('検索中')) break
      await wait(50)
    }
    const doneMs = Date.now() - t
    const jank = await stopJank(page)
    const ev = await page.evaluate(() => window.__findEvents.slice(-1)[0])
    const label = await page.locator('[data-testid=find-label]').innerText()
    const active = await page.evaluate(() => {
      const c = document.querySelector('.ssg-find-mark--current')
      return c ? c.closest('[role=gridcell]')?.textContent?.slice(0, 60) : null
    })
    console.log(JSON.stringify({ q, typedAt, doneMs, bar: txt.replace(/\s+/g, ' '), ev, label, active, jank }))
    await shot(page, `find-${tag}-${q.replace(/[^a-z0-9]/gi, '_')}`)
  }
  // 次へ / 前へ
  await page.locator('.ssg-find-bar input').fill('circuit breaker')
  await wait(3000)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
  await wait(300)
  console.log('after 3 Enter', await page.locator('.ssg-find-bar').innerText(), await page.evaluate(() => window.__grid.getActiveCell()))
  await page.keyboard.press('Shift+Enter')
  await wait(300)
  console.log('after Shift+Enter', await page.locator('.ssg-find-bar').innerText(), await page.evaluate(() => window.__grid.getActiveCell()))
  await page.keyboard.press('Escape')
  await wait(300)
  console.log('after Esc: bar', await page.locator('.ssg-find-bar').count(), 'focus', await page.evaluate(() => document.activeElement?.className))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).join('\n'))
  await browser.close()
})()
