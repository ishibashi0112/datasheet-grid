const { open, shot, wait, waitCountChange, rowCount, clickVisible } = require('./lib.cjs')
async function cards(page) {
  return page.evaluate(() => [...document.querySelectorAll('.ssg-detail-card')].map((c) => {
    const b = c.getBoundingClientRect()
    return { head: c.querySelector('.detail-head strong')?.textContent, top: Math.round(b.top), h: Math.round(b.height) }
  }))
}
async function visibleToggleRows(page) {
  return page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
    const hdr = document.querySelector('[role=columnheader]').getBoundingClientRect()
    return [...document.querySelectorAll('[data-pane="left"].ssg-body-row')].map((r) => ({ r, b: r.getBoundingClientRect() }))
      .filter(({ b }) => b.top >= hdr.bottom && b.bottom <= sc.bottom).sort((a, b) => a.b.top - b.b.top)
      .map(({ r, b }) => { const t = r.querySelector('[aria-expanded]'); const tb = t?.getBoundingClientRect(); return { no: r.querySelector('[role=rowheader]')?.textContent, ts: r.querySelectorAll('[role=gridcell]')[1]?.textContent, x: tb ? tb.left + tb.width / 2 : null, y: tb ? tb.top + tb.height / 2 : null, expanded: t?.getAttribute('aria-expanded') } })
  })
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await page.locator('.toolbar button', { hasText: 'ERROR 以上' }).click()
  console.log('ERROR+', await waitCountChange(page, 1000000))
  await wait(500)
  let v = await visibleToggleRows(page)
  await page.mouse.click(v[1].x, v[1].y)
  await wait(300)
  v = await visibleToggleRows(page)
  await page.mouse.click(v[v.length - 4].x, v[v.length - 4].y)
  await wait(500)
  const keys = await page.evaluate(() => window.__grid.getExpandedDetailRowKeys())
  console.log('expanded keys', keys, 'cards', JSON.stringify(await cards(page)))
  await shot(page, `detail-${tag}-open`)
  // カードの中の操作: 矢印キーがグリッドに伝わらないか
  const firstCardBtn = page.locator('.ssg-detail-card button', { hasText: 'JSON をコピー' }).first()
  await clickVisible(page, 0, 'center', 2)
  const acBefore = await page.evaluate(() => window.__grid.getActiveCell())
  await firstCardBtn.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  const acAfter = await page.evaluate(() => window.__grid.getActiveCell())
  console.log('arrow in card: activeCell before', JSON.stringify(acBefore), 'after', JSON.stringify(acAfter))
  await page.keyboard.press('Enter') // JSON をコピー
  await wait(200)
  console.log('clipboard JSON head', JSON.stringify((await page.evaluate(() => navigator.clipboard.readText())).slice(0, 80)))
  // Ctrl+C in card with text selection? 省略
  // 降順にする → 展開が行についていくか
  await page.locator('.toolbar button', { hasText: '新しい順' }).click()
  await wait(2500)
  console.log('after sort desc: keys', await page.evaluate(() => window.__grid.getExpandedDetailRowKeys()), 'cards on screen', JSON.stringify(await cards(page)))
  // 展開した行へスクロール
  const k = keys[0]
  const vi = await page.evaluate((k) => window.__grid.getViewRowIndex(k), k)
  await page.evaluate((vi) => window.__grid.scrollToRow(vi, { align: 'start' }), vi)
  await wait(500)
  console.log('scrolled to expanded row', k, 'view', vi, 'cards', JSON.stringify(await cards(page)))
  await shot(page, `detail-${tag}-sorted`)
  // フィルターで外す → 戻す
  await page.evaluate(() => {
    const g = window.__grid
    const cur = g.getState().filters.columnFilters
    g.applyState({ filters: { columnFilters: { ...cur, level: { kind: 'set', mode: 'include', values: ['FATAL'] } } } })
  })
  await wait(1500)
  console.log('FATAL only: count', await rowCount(page), 'keys', await page.evaluate(() => window.__grid.getExpandedDetailRowKeys()), 'viewIdx', await page.evaluate((k) => window.__grid.getViewRowIndex(k), k))
  await page.locator('.toolbar button', { hasText: 'ERROR 以上' }).click()
  await wait(1500)
  const vi2 = await page.evaluate((k) => window.__grid.getViewRowIndex(k), k)
  await page.evaluate((vi) => window.__grid.scrollToRow(vi, { align: 'start' }), vi2)
  await wait(500)
  console.log('restored: keys', await page.evaluate(() => window.__grid.getExpandedDetailRowKeys()), 'cards', JSON.stringify(await cards(page)))
  // ライブ追加(展開したまま)
  await page.locator('.toolbar button', { hasText: '古い順' }).click()
  await wait(1500)
  await page.locator('.toolbar input[type=checkbox]').nth(1).uncheck()
  await page.locator('.toolbar input[type=checkbox]').nth(0).check()
  const before = JSON.stringify(await cards(page))
  await wait(3500)
  console.log('live 3.5s (follow off): cards before', before, 'after', JSON.stringify(await cards(page)), 'count', await rowCount(page))
  await page.locator('.toolbar input[type=checkbox]').nth(0).uncheck()
  // 閉じるボタン → フォーカスがグリッドへ
  const closeBtn = page.locator('.ssg-detail-card button', { hasText: '閉じる' }).first()
  if (await closeBtn.count()) {
    await closeBtn.click()
    await wait(300)
    console.log('after close: focus', await page.evaluate(() => document.activeElement?.className), 'active', JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())), 'keys', await page.evaluate(() => window.__grid.getExpandedDetailRowKeys()))
  }
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
