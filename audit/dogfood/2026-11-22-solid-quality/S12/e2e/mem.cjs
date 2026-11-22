// 5 分動かしたときのメモリ(本番ビルド)。ほかの人のカーソルを 20 回/秒で動かしたまま、10 秒ごとにスクロール、30 秒ごとに編集。
// node mem.cjs <order: solid,react> <minutes> <mode>
const { chromium } = require('playwright')
const order = (process.argv[2] || 'solid,react').split(',')
const minutes = Number(process.argv[3] || 5)
const mode = process.argv[4] || 'jsx'
async function run(app) {
  const browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)) })
  await page.goto(`http://localhost:5512/${app}/?peer=${mode}`)
  await page.waitForSelector('.ssg-body-cell')
  await page.waitForTimeout(1000)
  await page.mouse.move(700, 500)
  const sample = async (t) => {
    await page.evaluate(() => { window.gc(); window.gc() })
    await page.waitForTimeout(200)
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
    const heap = await page.evaluate(() => performance.memory.usedJSHeapSize)
    return { t, heapMB: Math.round(heap / 1e5) / 10, nodes: m.Nodes, listeners: m.JSEventListeners, attached: await page.evaluate(() => document.querySelectorAll('*').length) }
  }
  const samples = [await sample(0)]
  const t0 = Date.now()
  let k = 0
  while (Date.now() - t0 < minutes * 60000) {
    // 10 秒: 下へ 10 回、右へ 5 回スクロール
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60) }
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(300, 0); await page.waitForTimeout(60) }
    await page.waitForTimeout(9000)
    k++
    if (k % 3 === 0) {
      // 上へ戻して編集 1 回
      await page.evaluate(() => { window.__app.grid.scrollToTop(); document.querySelector('.ssg-scroll-container').scrollLeft = 0 })
      await page.waitForTimeout(300)
      const pos = await page.evaluate(() => { const h = window.__app.grid; const c = h.getColIndex('m201105'); const el = document.querySelector(`[role="row"][aria-rowindex="6"] [role="gridcell"][aria-colindex="${c + 2}"]`); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
      await page.mouse.click(pos.x, pos.y)
      await page.keyboard.type(String(100 + k))
      await page.keyboard.press('Enter')
      await page.mouse.move(700, 500)
      samples.push(await sample(Math.round((Date.now() - t0) / 1000)))
    }
  }
  samples.push(await sample(Math.round((Date.now() - t0) / 1000)))
  const undo = await page.evaluate(() => window.__app.grid.canUndo?.())
  await browser.close()
  return { app, mode, samples, errs: errs.slice(0, 3), undo }
}
;(async () => {
  for (const app of order) console.log(JSON.stringify(await run(app)))
})()
