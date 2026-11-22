const { open, sleep, cell } = require('./lib.cjs')
;(async () => {
  for (const q of ['', '?nospread=1']) {
    const { browser, page, logs } = await open('http://127.0.0.1:5503/' + q)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(800)
    await cell(page, 'P00002', 'stock').click(); await page.keyboard.type('5'); await page.keyboard.press('Enter'); await sleep(300)
    const t0 = Date.now()
    for (let i = 0; i < 10; i++) { await page.keyboard.type(String(i)); await page.keyboard.press('Enter') }
    await sleep(300)
    console.log(q || '(spread)', 'HUGE_FAN_OUT warnings:', logs.filter((l) => l.includes('[HUGE_FAN_OUT] Signal')).map((l) => l.split('\n')[0].slice(0, 120)))
    await browser.close()
  }
})()
