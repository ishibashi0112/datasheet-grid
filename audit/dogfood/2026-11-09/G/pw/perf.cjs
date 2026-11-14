const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const { startJank, stopJank, rowCount, waitCountChange, openFilterAt, clickVisible, clickPaneCell } = require('./lib.cjs')
// ページ内で「条件が成り立つまで」の時間を rAF で測る
async function timeUntil(page, action, predSrc, timeout = 120000) {
  await page.evaluate((predSrc) => {
    window.__tu = { start: performance.now(), end: null }
    const pred = new Function('return (' + predSrc + ')()')
    const loop = () => {
      try { if (pred()) { window.__tu.end = performance.now(); return } } catch {}
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }, predSrc)
  await action()
  const t = Date.now()
  while (Date.now() - t < timeout) {
    const r = await page.evaluate(() => window.__tu.end && window.__tu.end - window.__tu.start)
    if (r) return Math.round(r)
    await wait(50)
  }
  return -1
}
async function heap(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  const m = await cdp.send('Performance.getMetrics')
  const g = (n) => m.metrics.find((x) => x.name === n)?.value
  return { jsHeapMB: Math.round(g('JSHeapUsedSize') / 1e6), nodes: g('Nodes'), listeners: g('JSEventListeners') }
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const run = process.argv[3] ?? '1'
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.addInitScript(() => {
    const loop = () => {
      if (document.querySelector('[data-pane="center"].ssg-body-row')) { window.__firstRowAt = performance.now(); return }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector('[data-pane="center"].ssg-body-row', { timeout: 120000 })
  await wait(300)
  const init = await page.evaluate(() => ({ firstRowAt: Math.round(window.__firstRowAt), generateMs: Math.round(window.__perf.generateMs), mountedAt: Math.round(window.__perf.mountedMs) }))
  await wait(1500)
  const res = { run, init, heapAfterLoad: await heap(page, cdp) }
  const firstTsPred = (v) => `() => document.querySelector('[data-pane="left"].ssg-body-row [role=gridcell]:nth-child(2)')?.textContent !== ${JSON.stringify(v)} && document.querySelectorAll('[data-pane="left"].ssg-body-row')[0]?.querySelectorAll('[role=gridcell]')[1]?.textContent !== ${JSON.stringify(v)}`
  const firstTs = () => page.evaluate(() => document.querySelectorAll('[data-pane="left"].ssg-body-row')[0]?.querySelectorAll('[role=gridcell]')[1]?.textContent)
  // ソート(列メニュー → 降順)
  let ts = await firstTs()
  await clickPaneCell(page, 'left', 0, 1)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForSelector('.ssg-menu-panel')
  res.sortDescMs = await timeUntil(page, () => page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '降順で並び替え' }).click(), firstTsPred(ts))
  ts = await firstTs()
  res.sortAscMs = await timeUntil(page, () => page.locator('.toolbar button', { hasText: '古い順' }).click(), firstTsPred(ts))
  await page.evaluate(() => window.__grid.applyState({ sort: [] }))
  await wait(1000)
  // set フィルター(レベル: ERROR 以上 = ツールバー)
  const countPred = (n) => `() => { const m = document.querySelector('.ssg-bar--bottom')?.innerText.match(/行\\s*(\\d+)/); return m && Number(m[1]) !== ${n} }`
  res.setFilterMs = await timeUntil(page, () => page.locator('.toolbar button', { hasText: 'ERROR 以上' }).click(), countPred(1000000))
  res.setFilterCount = await rowCount(page)
  res.clearFilterMs = await timeUntil(page, () => page.locator('.toolbar button', { hasText: '絞り込みを解除' }).click(), countPred(res.setFilterCount))
  await wait(500)
  // 時刻の dateSet ポップオーバーを開く(候補の収集)
  res.dateSetOpenMs = await timeUntil(page, () => openFilterAt(page, 'left', 1), `() => { const p = document.querySelector('.ssg-filter-popover'); return p && !p.innerText.includes('収集中') && p.innerText.includes('今日') }`)
  res.presetTodayMs = await timeUntil(page, () => page.locator('.ssg-filter-popover button', { hasText: '今日' }).first().click(), countPred(1000000))
  res.presetTodayCount = await rowCount(page)
  await page.keyboard.press('Escape')
  await wait(300)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {} } }))
  await wait(800)
  res.dateSetReopenMs = await timeUntil(page, () => openFilterAt(page, 'left', 1), `() => { const p = document.querySelector('.ssg-filter-popover'); return p && !p.innerText.includes('収集中') && p.innerText.includes('今日') }`)
  await page.keyboard.press('Escape')
  await wait(300)
  // グローバルフィルター
  const input = page.locator('.ssg-bar--top input')
  for (const q of ['u-31337', 'Unhandled exception', 'nohit-xyz']) {
    await startJank(page)
    res['global:' + q] = await timeUntil(page, () => input.fill(q), `() => { const r = document.querySelector('.ssg-root'); const m = document.querySelector('.ssg-bar--bottom')?.innerText.match(/行\\s*(\\d+)/); return m && Number(m[1]) !== 1000000 && !r.innerText.includes('適用中') }`)
    res['global:' + q + ':jank'] = (await stopJank(page)).maxGap
    res['global:' + q + ':count'] = await rowCount(page)
    await input.fill('')
    await page.waitForFunction(() => /行\s*1000000/.test(document.querySelector('.ssg-bar--bottom')?.innerText ?? ''), null, { timeout: 60000 })
  }
  // セル内検索
  await clickVisible(page, 1, 'center', 1)
  await page.keyboard.press('Control+f')
  await page.waitForSelector('.ssg-find-bar input')
  for (const q of ['circuit breaker', 'nohit-xyz']) {
    await page.locator('.ssg-find-bar input').fill('')
    await wait(300)
    await startJank(page)
    res['find:' + q] = await timeUntil(page, () => page.locator('.ssg-find-bar input').fill(q), `() => { const b = document.querySelector('.ssg-find-bar'); return b && !b.innerText.includes('検索中') && /\\d/.test(b.innerText) }`)
    res['find:' + q + ':jank'] = (await stopJank(page)).maxGap
    res['find:' + q + ':bar'] = (await page.locator('.ssg-find-bar').innerText()).replace(/\s+/g, ' ')
  }
  await page.keyboard.press('Escape')
  res.heapAfterOps = await heap(page, cdp)
  // ライブ(毎秒 50 行)の重さ: 何もしていない / ソートあり / set フィルターあり
  await page.locator('.toolbar input[type=checkbox]').nth(0).check()
  await wait(1500)
  await startJank(page)
  await wait(6000)
  res.liveIdle = await stopJank(page)
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'ts', direction: 'desc' }] }))
  await wait(2000)
  await startJank(page)
  await wait(6000)
  res.liveSortDesc = await stopJank(page)
  await page.evaluate(() => window.__grid.applyState({ sort: [], filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['ERROR', 'FATAL'] } } } }))
  await wait(2000)
  await startJank(page)
  await wait(6000)
  res.liveSetFilter = await stopJank(page)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {} } }))
  await wait(1500)
  // ライブ + グローバルフィルター: 20 秒で絞り込みが終わるか
  await input.fill('circuit breaker')
  const t0 = Date.now()
  let done = -1
  while (Date.now() - t0 < 20000) {
    const n = await rowCount(page)
    const total = Number((await page.locator('.toolbar .muted').first().innerText()).replace(/[^\d]/g, ''))
    if (n < total * 0.9) { done = Date.now() - t0; break }
    await wait(250)
  }
  res.liveGlobalFilterDoneMs = done
  res.liveGlobalCount = await rowCount(page)
  await input.fill('')
  await page.locator('.toolbar input[type=checkbox]').nth(0).uncheck()
  await wait(1500)
  res.heapEnd = await heap(page, cdp)
  console.log(JSON.stringify(res, null, 1))
  console.log(logs.filter((l) => !l.includes('DevTools')).slice(0, 20).join('\n'))
  await browser.close()
})()
