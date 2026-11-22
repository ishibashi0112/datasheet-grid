// 100 万行で Ctrl+End / Ctrl+Home を 6 回ずつ(バーの番地が変わるまでの時間)
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
;(async () => {
  const { browser, page } = await open('http://127.0.0.1:5505/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 120000 }); await sleep(2000)
  await page.locator('.ssg-body-row[data-pane=center] .ssg-body-cell').first().click(); await sleep(300)
  const res = { end: [], home: [] }
  const wait = (re) => page.evaluate((src) => new Promise((resolve) => { const t0 = performance.now(); const re = new RegExp(src); const f = () => { if (re.test(document.querySelector('.ssg-bar--bottom')?.innerText || '') && [...document.querySelectorAll('.ssg-body-row')].length) resolve(Math.round(performance.now() - t0)); else requestAnimationFrame(f) }; f() }), re)
  for (let i = 0; i < 6; i++) {
    const p1 = wait('セル\\s*\\S+1000000'); await page.keyboard.press('Control+End'); res.end.push(await p1); await sleep(400)
    const p2 = wait('セル\\s*A1\\b'); await page.keyboard.press('Control+Home'); res.home.push(await p2); await sleep(400)
  }
  console.log(label, JSON.stringify(res))
  await browser.close()
})()
