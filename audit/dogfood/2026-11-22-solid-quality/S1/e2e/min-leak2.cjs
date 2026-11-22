// 要素のハンドルを持たない形で測り直す(waitForSelector のハンドルが DOM を掴むため)
const { chromium } = require('playwright')
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await page.goto(url)
  const waitCells = async () => { for (let i = 0; i < 100; i++) { if (await page.evaluate(() => !!document.querySelector('.ssg-body-cell'))) return; await page.waitForTimeout(20) } throw new Error('no cells') }
  await waitCells()
  const cdp = await page.context().newCDPSession(page)
  const toggle = () => page.evaluate(() => { document.getElementById('toggle').click() })
  const heap = async () => { for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100) } return ((await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6).toFixed(1) }
  await toggle(); await page.waitForTimeout(200)
  const out = [await heap()]
  for (let round = 0; round < 3; round++) {
    for (let k = 0; k < 10; k++) { await toggle(); await waitCells(); await page.waitForTimeout(100); await toggle(); await page.waitForTimeout(80) }
    out.push(await heap())
  }
  console.log(url, 'heap MB at 0/10/20/30 mounts:', out.join(' / '))
  await browser.close()
})()
