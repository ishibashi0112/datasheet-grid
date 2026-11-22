// async-min.html: 取り直しの間にホイールと矢印キー
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
;(async () => {
  for (const kind of ['memo', 'deferred']) {
    const { browser, page, logs } = await open(`http://127.0.0.1:5505/async-min.html?kind=${kind}`)
    await page.waitForSelector('.ssg-body-cell', { timeout: 20000 }); await sleep(500)
    await page.locator('.ssg-body-row[data-pane="center"] [data-ssg-col-key="name"]').nth(1).click(); await sleep(200)
    const snap = () => page.evaluate(() => {
      const rows = [...document.querySelectorAll('.ssg-body-row[data-pane=center]')].map((r) => +r.dataset.rowIndex).sort((a, b) => a - b)
      return `pending=${document.querySelector('[data-testid=pending]')?.textContent} rendered=${rows[0]}..${rows.at(-1)} active=${document.querySelector('.ssg-bar--bottom')?.innerText.match(/セル\s*(\S+)/)?.[1]}`
    })
    await page.evaluate(() => window.__next()); await sleep(200)
    await page.mouse.move(300, 300); await page.mouse.wheel(0, 2000); await sleep(400)
    const a = await snap()
    await page.keyboard.press('ArrowDown'); await sleep(300)
    const b = await snap()
    await page.screenshot({ path: `${__dirname}/shots/t22-${label}-${kind}.png` })
    await sleep(3000)
    const c = await snap()
    console.log(`[${label}] ${kind}: during(after wheel) ${a} | during(after ↓) ${b} | landed ${c}`)
    const diag = logs.filter((l) => /STACKED|HOLD|error/i.test(l)).map((l) => l.split('\n')[0].slice(0, 120))
    if (diag.length) console.log('   ', diag.join(' || '))
    await browser.close()
  }
})()
