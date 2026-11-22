// 末尾を追うモードの 1 回の追加(毎秒 50 行)にかかる主スレッドの時間
// 使い方: node t10-append.cjs <label> <n>
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2] ?? 'x'
  const n = Number(process.argv[3] ?? 20000)
  const { browser, context, page, logs } = await open(`http://127.0.0.1:5505/?n=${n}`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 120000 })
  await sleep(1500)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  await page.evaluate(() => {
    window.__lt = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask' })
  })
  const phase = async (name, ms) => {
    await page.evaluate(() => (window.__lt = []))
    const a = await metric()
    const t = Date.now()
    await sleep(ms)
    const b = await metric()
    const sec = (Date.now() - t) / 1000
    const lt = await page.evaluate(() => window.__lt)
    return {
      name,
      cpuMsPerSec: Math.round(((b.TaskDuration - a.TaskDuration) * 1000) / sec),
      scriptMsPerSec: Math.round(((b.ScriptDuration - a.ScriptDuration) * 1000) / sec),
      layoutMsPerSec: Math.round(((b.LayoutDuration - a.LayoutDuration + b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000) / sec),
      longTasks: lt.length,
      ltMax: Math.max(0, ...lt),
    }
  }
  const res = [label, n]
  res.push(await phase('idle', 6000))
  // 末尾へ → 末尾を追う
  await page.getByRole('button', { name: '末尾へ' }).click()
  await sleep(500)
  await page.locator('[data-testid=tail]').check()
  await sleep(1200)
  res.push(await phase('tail-bottom', 12000))
  // 上を見ている(追加だけ。スクロールしない)
  const box = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -400)
    await sleep(60)
  }
  await sleep(1200)
  res.push(await phase('tail-up', 12000))
  console.log(JSON.stringify(res))
  const errs = logs.filter((l) => !l.includes('[vite]'))
  if (errs.length) console.log(errs.slice(0, 5).join('\n'))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
