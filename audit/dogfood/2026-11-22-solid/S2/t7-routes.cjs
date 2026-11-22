const { launch, BASE, clearLog, serverLog, chaos } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await launch()
  await chaos(page, { getFailRate: 0, patchFailRate: 0, getDelay: 50 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  await cdp.send('Runtime.enable')
  const measure = async (label) => {
    await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(200)
    await cdp.send('HeapProfiler.collectGarbage')
    const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize
    const dom = await cdp.send('Memory.getDOMCounters')
    const listenerCount = async (expr) => {
      const { result } = await cdp.send('Runtime.evaluate', { expression: expr })
      const l = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
      return l.listeners.length
    }
    const wl = await listenerCount('window'), dl = await listenerCount('document'), bl = await listenerCount('document.body')
    const bodyChildren = await page.evaluate(() => document.body.children.length)
    return { label, heapMB: +(heap / 1048576).toFixed(2), nodes: dom.nodes, jsListeners: dom.jsEventListeners, docs: dom.documents, window: wl, document: dl, body: bl, bodyChildren }
  }
  await page.goto(BASE + '/users')
  await page.locator('.ssg-body-row:not([data-skeleton-row])').first().waitFor()
  await page.waitForTimeout(1000)
  const res = [await measure('start /users')]
  const nav = async (name) => { await page.locator('.nav a', { hasText: name }).click(); await page.waitForTimeout(400) }
  for (let i = 1; i <= Number(process.env.N ?? 30); i++) {
    for (const r of (process.env.ROUTES ?? 'User #1,Settings,Users').split(',')) await nav(r)
    await page.locator('.nav a', { hasText: 'Users' }).waitFor()
    await page.waitForTimeout(300)
    if (i === 1 || i === 10 || i === 20 || i === 30) res.push(await measure(`after ${i} rounds`))
  }
  // ルートを外したままの状態でも測る
  await nav('Settings')
  res.push(await measure('settings (no grid)'))
  console.table(res)
  const roots = await page.evaluate(() => document.querySelectorAll('.ssg-root').length)
  console.log('roots on settings', roots, 'portals', await page.evaluate(() => [...document.body.children].map((e) => e.tagName + '.' + e.className).join(', ')))
  const msgs = {}
  for (const l of logs) { const k = l.slice(0, 120); msgs[k] = (msgs[k] ?? 0) + 1 }
  console.log(msgs)
  await browser.close()
})()
