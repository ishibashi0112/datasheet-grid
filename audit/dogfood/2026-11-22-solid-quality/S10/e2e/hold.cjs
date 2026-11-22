// キーを押し続けたとき(33ms ごと = 自動の繰り返し)の遅れ: 最後のキーから下が追いつくまで
const { open, clickCell, sleep } = require('./lib.cjs')
const [qs = '', steps = '30', gap = '33'] = process.argv.slice(2)
;(async () => {
  const { browser, page } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  await sleep(800)
  const n = Number(steps)
  const id = 'O' + String(n + 1).padStart(5, '0')
  const t0 = Date.now()
  for (let i = 0; i < n; i++) { await page.keyboard.press('ArrowDown'); await sleep(Number(gap)) }
  const tKeys = Date.now() - t0
  const tl = await page.evaluate(() => performance.now())
  await page.waitForFunction((id) => document.querySelector('.bottom h2')?.textContent?.includes(id) && !!document.querySelector(`[role=grid][aria-label="Lines"] [data-row-key="${id}-1"]`), id, { polling: 'raf' })
  const lag = await page.evaluate((tl) => new Promise((r) => requestAnimationFrame(() => r(Math.round(performance.now() - tl)))), tl)
  // ArrowRight だけを間を空けずに 30 回(下は替わらない)
  const t1 = Date.now()
  for (let i = 0; i < 30; i++) await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight')
  console.log(JSON.stringify({ qs, steps, gap, tKeys, lagAfterLast: lag, ideal: n * (Number(gap) + 0), rightLeft30: Date.now() - t1 }))
  await browser.close()
})()
