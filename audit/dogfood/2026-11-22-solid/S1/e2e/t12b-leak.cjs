const { open } = require('./lib.cjs')
;(async () => {
  const base = process.argv[2] || 'http://localhost:5501/'
  const tabs = (process.argv[3] || 'signal').split(',')
  const { browser, page, logs, context } = await open(`${base}?tab=${tabs[0]}`)
  const cdp = await context.newCDPSession(page)
  const heap = async () => { for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100) } return ((await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6).toFixed(1) }
  await page.click('#tab-none'); await page.waitForTimeout(200)
  const out = [await heap()]
  let i = 0
  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < 10; k++, i++) {
      await page.click(`#tab-${tabs[i % tabs.length]}`); await page.waitForSelector('.ssg-body-cell'); await page.waitForTimeout(120)
      await page.click('#tab-none'); await page.waitForTimeout(80)
    }
    out.push(await heap())
  }
  const nodes = await cdp.send('Runtime.evaluate', { expression: 'document.getElementsByTagName("*").length', returnByValue: true })
  console.log(tabs.join(','), 'heap MB at 0/10/20/30/40 mounts:', out.join(' / '), 'DOM nodes', nodes.result.value)
  await browser.close()
})()
