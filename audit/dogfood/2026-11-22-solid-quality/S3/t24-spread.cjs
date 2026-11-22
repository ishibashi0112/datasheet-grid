// spread.html の各ケースで、最初の描画と 1 回の更新のコンソールを数える
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
;(async () => {
  for (const c of ['inline', 'signal', 'stable', 'wrapper', 'omit']) {
    const { browser, page, logs } = await open(`http://127.0.0.1:5503/spread.html?case=${c}`)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }).catch(() => logs.push('NO CELLS')); await sleep(600)
    await page.evaluate(() => window.__set()); await sleep(400)
    const diag = logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0].slice(0, 150))
    console.log(`[${label}] ${c}: ${diag.length ? diag.join(' || ') : '(なし)'}`)
    await browser.close()
  }
})()
