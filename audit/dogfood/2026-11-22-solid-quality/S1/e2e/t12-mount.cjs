const { open, click, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs, context } = await open(`http://localhost:5501/?tab=signal`)
  const cdp = await context.newCDPSession(page)
  const counts = async () => page.evaluate(() => ({
    bodyChildren: [...document.body.children].map((e) => e.className || e.id || e.tagName).join(','),
    ssgRoots: document.querySelectorAll('.ssg-root').length,
  }))
  // 列メニューを開いたままタブを切り替える
  const h = page.locator('[role="columnheader"][aria-colindex="4"]').first()
  await h.hover(); await page.waitForTimeout(100)
  await h.locator('button, [role="button"]').last().click()
  await page.waitForTimeout(200)
  console.log('menu open', await counts())
  await page.click('#tab-none')
  await page.waitForTimeout(300)
  console.log('after unmount w/ menu open', await counts())
  // エディタを開いたまま切り替え
  await page.click('#tab-signal'); await page.waitForSelector('.ssg-body-cell'); await page.waitForTimeout(200)
  await click(page, 3, 3, { clickCount: 2 }); await page.keyboard.type('abc')
  await page.click('#tab-none'); await page.waitForTimeout(300)
  console.log('after unmount w/ editor open', await counts())
  // 20 回往復
  await cdp.send('HeapProfiler.collectGarbage')
  const m0 = (await cdp.send('Runtime.getHeapUsage')).usedSize
  const l0 = await cdp.send('DOMDebugger.getEventListeners', { objectId: (await cdp.send('Runtime.evaluate', { expression: 'window' })).result.objectId })
  for (let i = 0; i < 20; i++) {
    await page.click(i % 2 ? '#tab-store' : '#tab-signal'); await page.waitForSelector('.ssg-body-cell'); await page.waitForTimeout(150)
    await page.click('#tab-none'); await page.waitForTimeout(100)
  }
  await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(300); await cdp.send('HeapProfiler.collectGarbage')
  const m1 = (await cdp.send('Runtime.getHeapUsage')).usedSize
  const l1 = await cdp.send('DOMDebugger.getEventListeners', { objectId: (await cdp.send('Runtime.evaluate', { expression: 'window' })).result.objectId })
  const d1 = await cdp.send('DOMDebugger.getEventListeners', { objectId: (await cdp.send('Runtime.evaluate', { expression: 'document' })).result.objectId })
  console.log('heap MB', (m0 / 1e6).toFixed(1), '->', (m1 / 1e6).toFixed(1), 'window listeners', l0.listeners.length, '->', l1.listeners.length, 'document listeners', d1.listeners.length)
  console.log('window listener types', [...new Set(l1.listeners.map((x) => x.type))].join(','))
  console.log('final', await counts())
  const errs = logs.filter((l) => /^\[(error|pageerror|warning)\]/.test(l)).map((l) => l.split('\n')[0].slice(0, 200))
  console.log('errors/warnings', [...new Set(errs)])
  await browser.close()
})()
