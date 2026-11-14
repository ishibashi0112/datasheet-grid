const { open, shot } = require('./lib.cjs')
async function measure(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  await page.waitForTimeout(200)
  await cdp.send('HeapProfiler.collectGarbage')
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  const win = await cdp.send('Runtime.evaluate', { expression: 'window' })
  const doc = await cdp.send('Runtime.evaluate', { expression: 'document' })
  const wl = (await cdp.send('DOMDebugger.getEventListeners', { objectId: win.result.objectId })).listeners
  const dl = (await cdp.send('DOMDebugger.getEventListeners', { objectId: doc.result.objectId })).listeners
  const count = (ls) => { const o = {}; for (const l of ls) o[l.type] = (o[l.type] || 0) + 1; return o }
  const bodyKids = await page.evaluate(() => document.body.children.length)
  const roots = await page.evaluate(() => document.querySelectorAll('.ssg-root').length)
  // ResizeObserver などは数えられないので Nodes と JSEventListeners を見る
  return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, win: wl.length, doc: dl.length, winTypes: count(wl), docTypes: count(dl), bodyKids, roots }
}
;(async () => {
  const kind = process.argv[2] || 'tabs'
  const n = Number(process.argv[3] || 50)
  const q = process.argv[4] || ''
  const { browser, page, logs } = await open(kind === 'tabs' ? '?tabs=unmount' : q)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.waitForTimeout(2500)
  const m0 = await measure(page, cdp)
  console.log('start', JSON.stringify(m0))
  const marks = []
  for (let i = 1; i <= n; i++) {
    if (kind === 'tabs' || kind === 'tabsforce') {
      await page.click(i % 2 ? '[data-testid=tab-stock]' : '[data-testid=tab-sales]')
      await page.waitForTimeout(120)
    } else if (kind === 'remount') {
      await page.click('[data-testid=settings-trigger]')
      await page.click('[data-testid=remount]')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    } else if (kind === 'dialog') {
      await page.click('[data-testid=dialog-open]')
      await page.locator('[data-testid=dialog] .ssg-root, [data-testid=dialog] input').first().waitFor()
      await page.waitForTimeout(150)
      if (process.env.CLOSE === 'button') await page.click('[data-testid=dialog] button:has-text("閉じる")')
      else await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    }
    if (i === 10 || i === 50 || i === 100 || i === n) marks.push([i, await measure(page, cdp)])
  }
  if (kind === 'tabs' || kind === 'tabsforce') { await page.click('[data-testid=tab-sales]'); await page.waitForTimeout(300) }
  const end = await measure(page, cdp)
  for (const [i, m] of marks) console.log('after', i, JSON.stringify(m))
  console.log('end', JSON.stringify(end))
  const l = logs.filter((x) => !x.includes('React DevTools'))
  if (l.length) console.log('logs:', [...new Set(l)].slice(0, 10).join('\n'), 'total', l.length)
  await browser.close()
})()
