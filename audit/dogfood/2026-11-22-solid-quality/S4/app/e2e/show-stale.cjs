// 隠している間に古いハンドルを呼ぶと、親の行はどうなるか
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:5504/'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.goto(`${BASE}show.html?visible`)
  await page.waitForTimeout(500)
  const rows = () => page.evaluate(() => { const r = window.rows(); return `len=${r.length} first=${r[0].id} last=${r.at(-1).id}` })
  console.log('initial', await rows())
  await page.evaluate(() => (window.old = typeof window.current === 'function' ? window.current() : window.current))
  await page.click('#toggle'); await page.waitForTimeout(300)
  // 隠している間に親が行を足す(ほかの画面での追加など)
  await page.evaluate(() => window.setRows([...window.rows(), { id: 999, name: '追加', qty: 0 }]))
  await page.waitForTimeout(100)
  console.log('hidden, parent added row 999', await rows())
  // ツールバーのボタンから古いハンドルで先頭の行を消す
  const r = await page.evaluate(() => { try { return String(window.old.applyRows((p) => p.slice(1))) } catch (e) { return 'THROWS ' + e.message } })
  await page.waitForTimeout(100)
  console.log('old.applyRows(slice(1)) ->', r, await rows())
  const r2 = await page.evaluate(() => { try { return String(window.old.canUndo()) + ' undo:' + String(window.old.undo()) } catch (e) { return 'THROWS ' + e.message } })
  await page.waitForTimeout(100)
  console.log('old.canUndo/undo ->', r2, await rows())
  console.log('LOGS', logs.filter((l) => !l.includes('[vite]')).join('\n'))
  await browser.close()
})()
