// スクロールの長いタスクを縦 / 横に分けて測る(本番ビルド、solid と react を交互に)
const { chromium } = require('playwright')
const runs = Number(process.argv[2] || 2)
const mode = process.argv[3] || 'none'
const extra = process.argv[4] || ''
async function measure(app) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true }) })
  await page.goto(`http://localhost:5512/${app}/?peer=${mode}&nopeers${extra}`)
  await page.waitForSelector('.ssg-body-cell')
  await page.waitForTimeout(1000)
  await page.mouse.move(700, 500)
  const res = { app }
  const dom = () => page.evaluate(() => ({ els: document.querySelectorAll('*').length, cells: document.querySelectorAll('[role=gridcell]').length, rows: document.querySelectorAll('[role=row]').length }))
  res.dom0 = await dom()
  for (const [name, dx, dy, n] of [['v', 0, 300, 40], ['h', 400, 0, 30], ['v-big', 0, 3000, 20]]) {
    await page.evaluate(() => { window.__lt = []; window.__fr = { n: 0, worst: 0, last: performance.now(), stop: false, t0: performance.now(), gaps: [] }; const loop = (t) => { const f = window.__fr; f.n++; const d = t - f.last; if (d > 34) f.gaps.push(Math.round(d)); f.worst = Math.max(f.worst, d); f.last = t; if (!f.stop) requestAnimationFrame(loop) }; requestAnimationFrame(loop) })
    for (let i = 0; i < n; i++) { await page.mouse.wheel(dx, dy); await page.waitForTimeout(16) }
    await page.waitForTimeout(200)
    res[name] = await page.evaluate(() => { const f = window.__fr; f.stop = true; const sec = (performance.now() - f.t0) / 1000; return { fps: Math.round(f.n / sec), worst: Math.round(f.worst), lt: window.__lt.slice(0, 25), gaps: f.gaps.slice(0, 20) } })
    if (name === 'h') await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollLeft = 0 })
    await page.waitForTimeout(300)
  }
  res.dom1 = await dom()
  await browser.close()
  return res
}
;(async () => {
  for (let i = 0; i < runs; i++) for (const app of i % 2 ? ['react', 'solid'] : ['solid', 'react']) console.log(JSON.stringify(await measure(app)))
})()
