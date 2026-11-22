// 本番ビルドの速さ: 読み込み / 20 回毎秒のカーソルの CPU / ホイールでのスクロールのフレーム / 編集の反応 / ヒープ
// node perf.cjs <runs> <modes> → solid と react を交互に測る
const { chromium } = require('playwright')
const runs = Number(process.argv[2] || 2)
const modes = (process.argv[3] || 'jsx,body,none').split(',')
const base = 'http://localhost:5512'
async function measure(app, mode) {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  await page.addInitScript(() => {
    window.__lt = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration) }).observe({ type: 'longtask', buffered: true })
  })
  const t0 = Date.now()
  await page.goto(`${base}/${app}/?peer=${mode}&nopeers`)
  await page.waitForSelector('.ssg-body-cell')
  const load = Date.now() - t0
  await page.waitForTimeout(1000)
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  // 1. ほかの人のカーソルを 5 秒動かす(none でも tick は回る = 印を描かないだけ)
  let m0 = await metrics()
  const frames = await page.evaluate(async () => {
    window.__lt = []
    let n = 0, worst = 0, last = performance.now()
    let stop = false
    const loop = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (!stop) requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    window.__app.setRunning(true)
    await new Promise((r) => setTimeout(r, 5000))
    window.__app.setRunning(false)
    stop = true
    return { fps: n / 5, worstFrame: Math.round(worst), longtasks: window.__lt.length, longtaskMs: Math.round(window.__lt.reduce((s, x) => s + x, 0)) }
  })
  let m1 = await metrics()
  const tick = { cpuMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), recalcMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), ...frames }
  // 2. ホイールの縦スクロール 40 回(カーソルは止めたまま)+ 横 30 回
  await page.mouse.move(700, 500)
  m0 = await metrics()
  await page.evaluate(() => {
    window.__lt = []
    window.__fr = { n: 0, worst: 0, last: performance.now(), stop: false }
    const loop = (t) => { const f = window.__fr; f.n++; f.worst = Math.max(f.worst, t - f.last); f.last = t; if (!f.stop) requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    window.__fr.t0 = performance.now()
  })
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(16) }
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(400, 0); await page.waitForTimeout(16) }
  await page.waitForTimeout(200)
  const scrollF = await page.evaluate(() => { const f = window.__fr; f.stop = true; const sec = (performance.now() - f.t0) / 1000; const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root'); const blanks = [...root.querySelectorAll('[role=gridcell]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left < innerWidth && b.right > 0 && b.top > 140 && b.bottom < innerHeight && e.textContent === '' }).length; return { fps: Math.round(f.n / sec), worstFrame: Math.round(f.worst), longtasks: window.__lt.length, longtaskMs: Math.round(window.__lt.reduce((s, x) => s + x, 0)), blanks } })
  m1 = await metrics()
  const scroll = { cpuMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), ...scrollF }
  // 3. 編集の反応: 見えているセルを押して数字キー → エディタが出るまで、Enter → 値が表に出るまで(カーソルを動かしながら)
  await page.evaluate(() => { window.__app.grid.scrollToTop(); const sc = document.querySelector('.ssg-scroll-container'); sc.scrollLeft = 0; window.__app.setRunning(true) })
  await page.waitForTimeout(400)
  const edits = []
  for (let k = 0; k < 5; k++) {
    const pos = await page.evaluate((k) => { const h = window.__app.grid; const c = h.getColIndex('m201105'); const el = document.querySelector(`[role="row"][aria-rowindex="${4 + k + 2}"] [role="gridcell"][aria-colindex="${c + 2}"]`); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }, k)
    await page.mouse.click(pos.x, pos.y)
    await page.waitForTimeout(100)
    // keydown(capture)の時刻と、エディタが DOM に入った時刻 / 確定で値が書き変わった時刻(次の rAF まで)を取る
    await page.evaluate((k) => {
      const w = window
      w.__ed = { kd: 0, open: 0, enter: 0, commit: 0 }
      w.__kd && document.removeEventListener('keydown', w.__kd, true)
      w.__kd = (e) => { if (e.key === '7') w.__ed.kd = performance.now(); if (e.key === 'Enter') w.__ed.enter = performance.now() }
      document.addEventListener('keydown', w.__kd, true)
      w.__mo && w.__mo.disconnect()
      const h = w.__app.grid
      const c = h.getColIndex('m201105')
      const sel = `[role="row"][aria-rowindex="${4 + k + 2}"] [role="gridcell"][aria-colindex="${c + 2}"]`
      w.__mo = new MutationObserver(() => {
        if (!w.__ed.open && document.querySelector('.ssg-cell-editor input')) requestAnimationFrame(() => { w.__ed.open = performance.now() })
        if (w.__ed.enter && !w.__ed.commit) { const el = document.querySelector(sel); if (el && !document.querySelector('.ssg-cell-editor input') && el.textContent.replace(/\D/g, '').startsWith('7')) { w.__ed.commit = -1; requestAnimationFrame(() => { w.__ed.commit = performance.now() }) } }
      })
      w.__mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    }, k)
    await page.keyboard.press('7')
    await page.waitForFunction(() => window.__ed.open > 0, null, { timeout: 3000 }).catch(() => {})
    await page.keyboard.type(String(k))
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__ed.commit > 0, null, { timeout: 3000 }).catch(() => {})
    const r = await page.evaluate(() => { const e = window.__ed; window.__mo.disconnect(); return { open: Math.round(e.open - e.kd), commit: Math.round(e.commit - e.enter) } })
    edits.push(r)
  }
  await page.evaluate(() => window.__app.setRunning(false))
  // 4. ヒープ(GC の後)
  await page.evaluate(() => window.gc && window.gc())
  await page.waitForTimeout(300)
  const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e5) / 10)
  const nodes = (await metrics()).Nodes
  await browser.close()
  return { app, mode, load, tick, scroll, edit: { open: edits.map((e) => e.open), commit: edits.map((e) => e.commit) }, heapMB: heap, nodes, logs: logs.slice(0, 3) }
}
;(async () => {
  const res = []
  for (let i = 0; i < runs; i++) {
    for (const mode of modes) {
      for (const app of i % 2 === 0 ? ['solid', 'react'] : ['react', 'solid']) {
        const r = await measure(app, mode)
        console.log(JSON.stringify(r))
        res.push(r)
      }
    }
  }
})()
