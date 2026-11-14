const { open, shot, wait, startJank, stopJank, rowCount, waitCountChange, clickPaneCell } = require('./lib.cjs')
async function firstTs(page) {
  return page.locator('[data-pane="left"].ssg-body-row').first().locator('[role=gridcell]').nth(1).innerText()
}
async function waitFirstTsChange(page, prev, timeout = 60000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    const v = await firstTs(page).catch(() => prev)
    if (v !== prev) return { v, ms: Date.now() - t }
    await wait(20)
  }
  return { v: prev, ms: -1 }
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  // 並べ替え: 時刻の列メニューから降順
  let ts = await firstTs(page)
  await clickPaneCell(page, 'left', 0, 1)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForSelector('.ssg-menu-panel')
  await startJank(page)
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '降順で並び替え' }).click()
  let r = await waitFirstTsChange(page, ts)
  console.log('sort desc', r, JSON.stringify(await stopJank(page)))
  await shot(page, `sort-${tag}-desc`)
  ts = r.v
  // 昇順(ツールバー)
  await startJank(page)
  await page.locator('.toolbar button', { hasText: '古い順' }).click()
  r = await waitFirstTsChange(page, ts)
  console.log('sort asc', r, JSON.stringify(await stopJank(page)))
  ts = r.v
  // 2 列目のソート: Shift+見出しクリック (レベル)
  const hdr = page.locator('[role=columnheader]', { hasText: 'レベル' }).first()
  const hb = await hdr.boundingBox()
  await startJank(page)
  await page.keyboard.down('Shift')
  await page.mouse.click(hb.x + 20, hb.y + hb.height / 2)
  await page.keyboard.up('Shift')
  await wait(1500)
  console.log('sort state after shift-click', JSON.stringify(await page.evaluate(() => window.__grid.getState().sort)), JSON.stringify(await stopJank(page)))
  // ソート解除
  await page.evaluate(() => window.__grid.applyState({ sort: [] }))
  await wait(1500)
  // グローバルフィルター
  const input = page.locator('.ssg-bar--top input')
  await input.click()
  let c = await rowCount(page)
  for (const q of ['u-31337', 'circuit breaker OPEN', '在庫', 'nohit-xyz', '']) {
    await startJank(page)
    const t = Date.now()
    await input.fill(q)
    // 1 フレーム後にオーバーレイ
    await wait(50)
    const overlayShown = await page.evaluate(() => document.querySelector('.ssg-root')?.innerText.includes('フィルター') ?? false)
    const r2 = await waitCountChange(page, c, 60000)
    c = r2.count
    const j = await stopJank(page)
    console.log('global', JSON.stringify(q), r2, 'total', Date.now() - t, JSON.stringify(j))
    if (q === 'u-31337') await shot(page, `global-${tag}`)
  }
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).join('\n'))
  await browser.close()
})()
