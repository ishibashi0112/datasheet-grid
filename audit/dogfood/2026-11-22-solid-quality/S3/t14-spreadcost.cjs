const { open, sleep, cell } = require('./lib.cjs')
;(async () => {
  for (const round of [1, 2]) for (const q of ['', '?nospread=1']) {
    const { browser, page } = await open('http://127.0.0.1:5503/' + q)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(800)
    await cell(page, 'P00002', 'stock').click()
    // 1 回の編集(onRowsChange → setRows → 描画)にかかる時間: Delete キーで値を消す → 次のフレームまで
    const times = await page.evaluate(async () => {
      const shell = document.querySelector('.ssg-shell')
      const out = []
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now()
        shell.dispatchEvent(new KeyboardEvent('keydown', { key: i % 2 ? 'Delete' : 'Delete', bubbles: true }))
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
        out.push(performance.now() - t0)
      }
      return out
    })
    times.sort((a, b) => a - b)
    console.log(`round ${round} ${q || '(spread)'}: median ${times[7].toFixed(1)}ms max ${times[14].toFixed(1)}ms`)
    await browser.close()
  }
})()
