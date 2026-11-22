// <Show> で出し入れしたときの ref(実ブラウザ)
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:5504/'
;(async () => {
  const browser = await chromium.launch()
  for (const q of ['', '?visible']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const logs = []
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    await page.goto(`${BASE}show.html${q}`)
    await page.waitForTimeout(500)
    const out = []
    const call = (expr) => page.evaluate((expr) => { try { return JSON.stringify(eval(expr)) } catch (e) { return 'THROWS ' + e.message } }, expr)
    const toggle = async () => { await page.click('#toggle'); await page.waitForTimeout(400) }
    if (!q) await toggle() // 出す(1 回目)
    out.push('first show: log=' + JSON.stringify(await page.evaluate(() => window.log)))
    out.push('active cell DOM: ' + (await page.evaluate(() => document.querySelector('.ssg-body-cell[aria-selected="true"]')?.textContent)))
    // 隠す → 古いハンドルを呼ぶ
    await page.evaluate(() => (window.old = window.current()))
    await toggle()
    out.push('hidden: grids=' + (await page.evaluate(() => document.querySelectorAll('[role=grid]').length)))
    for (const m of ['window.old.getState().sort', 'window.old.getActiveCell()', 'window.old.getVisibleRowRange()', 'window.old.scrollToRow(10)', 'window.old.focus()', 'window.old.selectCell(1,0)', 'window.old.applyRows((p) => p.slice(1))', 'window.old.startEditing(0,0)', 'window.old.exportCsv().length', 'window.old.undo()'])
      out.push(`old handle after unmount: ${m} -> ${await call(m)}`)
    out.push('current() === old: ' + (await page.evaluate(() => window.current() === window.old)))
    // もう一度出す
    await page.evaluate(() => (window.log.length = 0))
    await toggle()
    out.push('second show: log=' + JSON.stringify(await page.evaluate(() => window.log)))
    out.push('current() === old: ' + (await page.evaluate(() => window.current() === window.old)))
    out.push('new handle visibleRange: ' + (await call('window.current().getVisibleRowRange()')))
    // 新しいグリッドで編集 → 古いハンドルの applyRows が新しいグリッドに効かないか
    out.push('old.applyRows after remount: ' + (await call('window.old.applyRows((p) => p.slice(5))')) + ' rows in DOM first=' + (await page.evaluate(() => document.querySelector('[data-pane="center"].ssg-body-row')?.getAttribute('data-row-key'))))
    // 速く 2 回切り替え
    await page.evaluate(() => { window.toggle(); window.toggle() })
    await page.waitForTimeout(300)
    out.push('double toggle in one tick: grids=' + (await page.evaluate(() => document.querySelectorAll('[role=grid]').length)) + ' log=' + JSON.stringify(await page.evaluate(() => window.log.slice(-2))))
    console.log(`===== show.html${q}`)
    for (const o of out) console.log(o)
    console.log('LOGS', logs.filter((l) => !l.includes('[vite]')).map((l) => l.slice(0, 300)).join('\n'))
    await context.close()
  }
  await browser.close()
})()