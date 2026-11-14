// 速い連続入力(バーコードリーダーのように「値 + Enter」を続けて送る)で値が失われないか
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:5411'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()) })
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  const results = []
  for (let iter = 0; iter < Number(process.env.ITER ?? 10); iter++) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-pane="center"].ssg-body-row')
    const cell = (r, key) => page.locator(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`).first()
    await cell(0, process.env.COL ?? 'note').click()
    const values = Array.from({ length: 8 }, (_, i) => `v${iter}${i}`)
    // delay 0 で 1 文字ずつ(Playwright の既定)
    await page.keyboard.type(values.map((v) => v + '\n').join(''), { delay: Number(process.env.DELAY ?? 0) })
    await page.waitForTimeout(300)
    const got = []
    for (let r = 0; r < 9; r++) got.push(await cell(r, process.env.COL ?? 'note').innerText())
    const ok = values.every((v, i) => got[i] === v)
    results.push({ iter, ok, got: ok ? undefined : got })
  }
  console.log(JSON.stringify({ results: results.filter((r) => !r.ok), okCount: results.filter((r) => r.ok).length, total: results.length, logs }, null, 1))
  await browser.close()
})()
