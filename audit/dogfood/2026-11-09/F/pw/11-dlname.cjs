const { open, handle } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  for (const name of ['estimate.csv', '見積書.csv', 'mitsumori 2026.csv']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), handle(page, `g.downloadCsv(arg)`, name)])
    console.log(JSON.stringify(name), '->', JSON.stringify(dl.suggestedFilename()))
  }
  // 自前の a[download] で日本語名
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['x'], { type: 'text/csv' })); a.download = '見積書.csv'; document.body.appendChild(a); a.click(); a.remove()
  })])
  console.log('manual a[download] 見積書.csv ->', dl2.suggestedFilename())
  console.log(logs)
  await browser.close()
})()
