const { open } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5509/'
  const { browser, page } = await open(url)
  // ダウンロードの名前: a[download] を見張る
  await page.evaluate(() => {
    const orig = HTMLAnchorElement.prototype.click
    window.__anchors = []
    HTMLAnchorElement.prototype.click = function () {
      window.__anchors.push({ download: this.download, href: this.href.slice(0, 30), connected: this.isConnected })
      return orig.call(this)
    }
  })
  for (const name of ['expense.csv', '経費精算_2026-11.csv', 'report']) {
    const dl = page.waitForEvent('download')
    await page.evaluate((n) => window.__grid.downloadCsv(n), name)
    const d = await dl
    console.log(JSON.stringify({ name, suggested: d.suggestedFilename() }))
  }
  console.log(JSON.stringify(await page.evaluate(() => window.__anchors)))
  await browser.close()
})()
