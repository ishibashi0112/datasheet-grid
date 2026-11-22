const { open, sleep, cell } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(500)
  await page.click('[data-testid=open-dialog]')
  await page.waitForSelector('[data-testid=dialog-grid] .ssg-body-cell', { timeout: 10000 })
  await sleep(1000)
  await page.evaluate(() => {
    window.__mut = []
    const t0 = performance.now()
    new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) if (n.nodeType === 1) window.__mut.push(`${Math.round(performance.now() - t0)} + ${n.className} in ${m.target.tagName}.${m.target.className}`.slice(0, 160)); for (const n of m.removedNodes) if (n.nodeType === 1) window.__mut.push(`${Math.round(performance.now() - t0)} - ${n.className} in ${m.target.tagName}`.slice(0, 160)) } }).observe(document.body, { childList: true, subtree: true })
    for (const ev of ['pointerdown', 'mousedown', 'contextmenu', 'pointerup', 'focusin', 'focusout']) document.addEventListener(ev, (e) => window.__mut.push(`${Math.round(performance.now() - t0)} ${ev} ${e.target.className?.toString().slice(0, 30)}`), true)
  })
  const dlg = page.locator('[data-testid=dialog]')
  await dlg.locator(`.ssg-body-row[data-pane="center"][data-row-key="P00003"] [data-ssg-col-key="price"]`).click({ button: 'right' }); await sleep(400)
  console.log((await page.evaluate(() => window.__mut)).filter((s) => !s.includes('ssg-body-row') ).slice(0, 40).join('\n'))
  await browser.close()
})()
