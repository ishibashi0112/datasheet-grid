// 株価タブを長く動かし、メモリ・DOM・CPU の割合・長いタスク・フレームを記録する
// 使い方: node t6-long.cjs <label> <signal|apply> <秒> [sort]
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2] ?? 'x'
  const mode = process.argv[3] ?? 'signal'
  const seconds = Number(process.argv[4] ?? 180)
  const sort = process.argv[5] === 'sort'
  const { browser, context, page, logs } = await open(`http://127.0.0.1:5505/?n=1000&tab=stocks&mode=${mode}`)
  await page.addInitScript(() => {})
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.evaluate(() => {
    window.__lt = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: false })
    window.__frames = []
    let last = performance.now()
    const loop = (t) => {
      window.__frames.push(t - last)
      last = t
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  if (sort) {
    const th = page.locator('.ssg-header-cell', { hasText: '前日比' })
    await th.hover()
    await th.locator('.ssg-icon-btn').last().click()
    await sleep(300)
    await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '降順' }).first().click()
  }
  // メモ列のセルをアクティブに(付いていく)
  await page.locator('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row) [data-ssg-col-key="memo"]').nth(8).click()
  const metric = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics')
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
  }
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    const m = await metric()
    return m
  }
  const t0 = Date.now()
  let prev = await metric()
  let prevT = Date.now()
  const samples = []
  const step = 30
  for (let s = step; s <= seconds; s += step) {
    await sleep(Math.max(0, t0 + s * 1000 - Date.now()))
    const now = Date.now()
    const m = await metric()
    const cpu = (m.TaskDuration - prev.TaskDuration) / ((now - prevT) / 1000)
    const script = (m.ScriptDuration - prev.ScriptDuration) / ((now - prevT) / 1000)
    const layout = (m.LayoutDuration - prev.LayoutDuration + m.RecalcStyleDuration - prev.RecalcStyleDuration) / ((now - prevT) / 1000)
    const pageStats = await page.evaluate(() => {
      const lt = window.__lt.splice(0)
      const fr = window.__frames.splice(0).sort((a, b) => a - b)
      const q = (p) => fr[Math.min(fr.length - 1, Math.floor(fr.length * p))] ?? 0
      return {
        ticks: document.querySelector('[data-testid=ticks]')?.textContent,
        lt: lt.length,
        ltMax: Math.round(Math.max(0, ...lt)),
        fps: Math.round((fr.length / 30) * 10) / 10,
        p50: Math.round(q(0.5) * 10) / 10,
        p95: Math.round(q(0.95) * 10) / 10,
        max: Math.round((fr[fr.length - 1] ?? 0) * 10) / 10,
      }
    })
    const h = await heap()
    samples.push({
      t: s,
      heapMB: Math.round((h.JSHeapUsedSize / 1048576) * 10) / 10,
      nodes: h.Nodes,
      listeners: h.JSEventListeners,
      cpuPct: Math.round(cpu * 1000) / 10,
      scriptPct: Math.round(script * 1000) / 10,
      layoutStylePct: Math.round(layout * 1000) / 10,
      ...pageStats,
    })
    prev = await metric()
    prevT = Date.now()
    console.log(JSON.stringify(samples[samples.length - 1]))
  }
  const active = await page.evaluate(() => window.__stockGrid.getActiveCell())
  console.log('active', JSON.stringify(active))
  console.log('logs', JSON.stringify(logs.filter((l) => !l.includes('[vite]')).slice(0, 20)))
  await page.screenshot({ path: `${__dirname}/shots/t6-${label}-${mode}${sort ? '-sort' : ''}.png` })
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
