// 比べるための基準: 上の表で同じ行の中を左右に動く(下は替わらない)/ 下の表を出さずに上下に動く
const { open, clickCell, sleep } = require('./lib.cjs')
const [qs = '', key = 'ArrowRight', steps = '30'] = process.argv.slice(2)
;(async () => {
  const { browser, page } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await sleep(500)
  const t0 = Date.now()
  for (let i = 0; i < Number(steps); i++) { await page.keyboard.press(i % 2 ? (key === 'ArrowRight' ? 'ArrowLeft' : 'ArrowUp') : key) }
  console.log(JSON.stringify({ key, steps, ms: Date.now() - t0 }))
  await browser.close()
})()
