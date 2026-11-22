// Event Timing で keydown の処理時間(ハンドラ)と、押してから描かれるまで(duration)を測る
const { open, clickCell, sleep } = require('./lib.cjs')
const [qs = '', key = 'ArrowDown', steps = '20'] = process.argv.slice(2)
;(async () => {
  const { browser, page } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  await sleep(800)
  await page.evaluate(() => {
    window.__ev = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown' || e.name === 'keyup') window.__ev.push({ n: e.name, proc: e.processingEnd - e.processingStart, dur: e.duration, after: e.startTime + e.duration - e.processingEnd }) }).observe({ type: 'event', durationThreshold: 16, buffered: false })
  })
  for (let i = 0; i < Number(steps); i++) { await page.keyboard.press(key === 'ArrowRight' ? (i % 2 ? 'ArrowLeft' : 'ArrowRight') : key); await sleep(120) }
  await sleep(500)
  const ev = await page.evaluate(() => window.__ev)
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null }
  const kd = ev.filter((e) => e.n === 'keydown'), ku = ev.filter((e) => e.n === 'keyup')
  console.log(JSON.stringify({ qs, key, keydownOver16: kd.length, procMedian: med(kd.map((e) => e.proc)), durMedian: med(kd.map((e) => e.dur)), afterHandlerMedian: med(kd.map((e) => e.after)), keyupOver16: ku.length, keyupProc: med(ku.map((e) => e.proc)) }))
  await browser.close()
})()
