// 上で ↓ を 1 回ずつ押し、下の見出しと先頭の明細が次の注文に変わるまでの時間(と長いタスク)
const { open, clickCell, sleep } = require('./lib.cjs')
const [qs = '', steps = '20', key = 'ArrowDown'] = process.argv.slice(2)
;(async () => {
  const { browser, page } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  await sleep(800)
  await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask' }) })
  const ds = []
  for (let i = 0; i < Number(steps); i++) {
    const n = i + 2
    const id = key === 'ArrowDown' ? 'O' + String(n).padStart(5, '0') : null
    const t0 = await page.evaluate(() => performance.now())
    await page.keyboard.press(key)
    if (id) await page.waitForFunction((id) => document.querySelector('.bottom h2')?.textContent?.includes(id) && !!document.querySelector(`[role=grid][aria-label="Lines"] [data-row-key="${id}-1"]`), id, { polling: 'raf' })
    // 描かれた次のフレームまで
    const t1 = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(performance.now()))))
    ds.push(Math.round(t1 - t0))
  }
  const lt = await page.evaluate(() => window.__lt)
  const sorted = [...ds].sort((a, b) => a - b)
  console.log(JSON.stringify({ qs, key, steps, median: sorted[Math.floor(sorted.length / 2)], mean: Math.round(ds.reduce((a, b) => a + b, 0) / ds.length), max: sorted.at(-1), longtasks: lt.length, longtaskMedian: [...lt].sort((a, b) => a - b)[Math.floor(lt.length / 2)] ?? 0 }))
  await browser.close()
})()
