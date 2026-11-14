const { open, shot, wait, waitCountChange, rowCount } = require('./lib.cjs')
async function layoutCheck(page) {
  return page.evaluate(() => {
    const res = []
    for (const c of document.querySelectorAll('.ssg-detail-card')) {
      const id = Number(c.querySelector('.detail-head strong')?.textContent.slice(1))
      const cb = c.getBoundingClientRect()
      // 行キー → 見えている行を探す: 時刻の文字で照合
      const ts = c.querySelector('.detail-head')?.childNodes[1]?.textContent?.trim()
      const row = [...document.querySelectorAll('[data-pane="left"].ssg-body-row')].find((r) => r.querySelectorAll('[role=gridcell]')[1]?.textContent === ts)
      const rb = row?.getBoundingClientRect()
      res.push({ id, cardTop: Math.round(cb.top), rowBottom: rb ? Math.round(rb.bottom) : null, gap: rb ? Math.round(cb.top - rb.bottom) : null })
    }
    return res
  })
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['WARN', 'ERROR', 'FATAL'] }, service: { kind: 'set', mode: 'include', values: ['checkout'] } } } }))
  await waitCountChange(page, 1000000)
  await wait(500)
  // 1, 3, 5 番目の行の展開(ハンドル)
  const keys = await page.evaluate(() => {
    const g = window.__grid
    const rows = [...document.querySelectorAll('[data-pane="left"].ssg-body-row')].slice(0, 8)
    return rows.map((r) => r.querySelectorAll('[role=gridcell]')[1]?.textContent)
  })
  await page.evaluate(() => { const g = window.__grid; for (const n of [1, 3, 5]) { const k = Number(document.querySelectorAll('[data-pane="left"].ssg-body-row [aria-expanded]')[n] ? n : n) } })
  // トグルを順に押す
  for (const n of [0, 2, 4]) {
    const t = page.locator('[data-pane="left"].ssg-body-row [aria-expanded="false"]').nth(n)
    await t.click()
    await wait(200)
  }
  await wait(500)
  console.log('expanded', await page.evaluate(() => window.__grid.getExpandedDetailRowKeys()), JSON.stringify(await layoutCheck(page)))
  await shot(page, `detail2-${tag}-autoheight`)
  // 下へスクロールして戻る
  const sc = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(sc.x + 700, sc.y + 300)
  for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 300); await wait(40) }
  for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, -300); await wait(40) }
  await wait(500)
  console.log('after scroll down/up', JSON.stringify(await layoutCheck(page)), 'scrollTop', await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop))
  // ソート降順 → 昇順
  await page.locator('.toolbar button', { hasText: '新しい順' }).click()
  await wait(1200)
  await page.locator('.toolbar button', { hasText: '古い順' }).click()
  await wait(1200)
  await page.evaluate(() => window.__grid.scrollToTop())
  await wait(500)
  console.log('after sort desc/asc + top', JSON.stringify(await layoutCheck(page)))
  await shot(page, `detail2-${tag}-after`)
  // カードの中にフォーカスがあるまま、もう一度フィルターを変える(カードの行が外れる)
  const btn = page.locator('.ssg-detail-card button', { hasText: 'JSON をコピー' }).first()
  await btn.focus()
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['DEBUG'] } } } }))
  await wait(1500)
  console.log('focus after filtering out the card row:', await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`), 'count', await rowCount(page))
  await page.keyboard.press('ArrowDown')
  await wait(200)
  console.log('ArrowDown after that → activeCell', JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
