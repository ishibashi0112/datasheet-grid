const { open, click, text } = require('./lib.cjs')
;(async () => {
  const base = process.argv[2] || 'http://localhost:5501/min-store.html'
  for (const mode of ['signal', 'store', 'snapshot']) {
    const { browser, page, logs } = await open(`${base}?mode=${mode}`)
    await click(page, 2, 2, { clickCount: 2 })
    await page.keyboard.type('X')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const afterEdit = await text(page, 2, 2)
    const canUndo = await page.evaluate(() => window.grid.canUndo())
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    const afterUndo = await text(page, 2, 2)
    const w = {}
    for (const l of logs) { const k = (l.match(/^\[(warning|error|pageerror)\] \[?([A-Z_]+)?/) || []); if (k[1]) { const kk = k[1] + ':' + (k[2] || ''); w[kk] = (w[kk] || 0) + 1 } }
    console.log(mode, { afterEdit, canUndo, afterUndo, warnings: w })
    await browser.close()
  }
})()
