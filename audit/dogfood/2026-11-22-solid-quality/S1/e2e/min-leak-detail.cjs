const { chromium } = require('playwright')
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await page.goto(url)
  await page.waitForSelector('.ssg-body-cell')
  const cdp = await page.context().newCDPSession(page)
  const toggle = () => page.evaluate(() => document.getElementById('toggle').click())
  const countOf = async (expr) => {
    for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(80) }
    const proto = await cdp.send('Runtime.evaluate', { expression: expr })
    const objs = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId })
    const len = await cdp.send('Runtime.callFunctionOn', { objectId: objs.objects.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true })
    return len.result.value
  }
  const snap = async () => ({ el: await countOf('HTMLElement.prototype'), ro: await countOf('ResizeObserver.prototype'), mo: await countOf('MutationObserver.prototype'), ac: await countOf('AbortController.prototype'), arr: await countOf('Array.prototype') })
  await toggle(); await page.waitForTimeout(200)
  const s0 = await snap()
  for (let k = 0; k < 10; k++) { await toggle(); await page.waitForSelector('.ssg-body-cell'); await page.waitForTimeout(100); await toggle(); await page.waitForTimeout(80) }
  const s1 = await snap()
  console.log(url, 'unmounted, before:', JSON.stringify(s0), 'after 10 mounts:', JSON.stringify(s1))
  await browser.close()
})()
