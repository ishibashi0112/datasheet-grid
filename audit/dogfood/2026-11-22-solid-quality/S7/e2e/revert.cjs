// 保存(action + createOptimistic)の後の refresh の取り直しの間、直したセルの値を 100ms ごとに見る(LOAD=memo / deferred)。createDeferred では元の値が一瞬出る(Solid の意味どおり)
const { open, clickCell, getCell, setSettings, sleep } = require('./lib.cjs')
const [mode = 'onFlush', dbl = '1'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode: process.env.LOAD || 'deferred', saveMode: mode, fill: true })
  await page.goto('http://localhost:5507/projects/web?minDelay=800&maxDelay=800&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]')
  await clickCell(page, 'タスク', 'web-5', 'title')
  await page.keyboard.type('C'); await page.keyboard.press('Enter')
  const t0 = Date.now(); const seq = []
  let did = false
  while (Date.now() - t0 < 2500) {
    if (dbl === '1' && !did && Date.now() - t0 > 300) { did = true; await clickCell(page, 'タスク', 'web-6', 'title', { double: true }); seq.push('DBL') }
    seq.push(`${Math.round((Date.now() - t0) / 100) * 100}:${await getCell(page, 'タスク', 'web-5', 'title')}`)
    await sleep(100)
  }
  console.log(mode, 'dbl=' + dbl, seq.join(' '))
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
