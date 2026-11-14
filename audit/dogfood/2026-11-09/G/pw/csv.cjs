const { chromium } = require('playwright')
const fs = require('fs')
const { startJank, stopJank } = require('./lib.cjs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(m.type() + ' ' + m.text()))
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  await page.goto(process.argv[2] ?? 'http://localhost:5407/')
  await page.waitForSelector('[data-pane="center"].ssg-body-row', { timeout: 120000 })
  await wait(1000)
  // フィルターした状態(ERROR 以上)で CSV
  await page.locator('.toolbar button', { hasText: 'ERROR 以上' }).click()
  await wait(1000)
  for (const label of ['filtered', 'all']) {
    if (label === 'all') { await page.locator('.toolbar button', { hasText: '絞り込みを解除' }).click(); await wait(1500) }
    await startJank(page)
    const t = Date.now()
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('.toolbar button', { hasText: 'CSV' }).click()])
    const p = `shots/logs-${label}.csv`
    await dl.saveAs(p)
    const ms = Date.now() - t
    const j = await stopJank(page)
    const buf = fs.readFileSync(p)
    const text = buf.toString('utf8')
    const lines = text.split('\r\n')
    console.log(label, { ms, sizeMB: Math.round(buf.length / 1e5) / 10, bom: buf[0] === 0xef && buf[1] === 0xbb, lines: lines.length, header: lines[0], first: lines[1], maxGap: j.maxGap })
    // 複数行のメッセージを含む行
    const ml = text.indexOf('"Unhandled exception')
    console.log(' multiline sample:', JSON.stringify(text.slice(ml, ml + 220)))
    fs.unlinkSync(p)
  }
  console.log(logs.filter((l) => !l.includes('DevTools')).join('\n'))
  await browser.close()
})()
