const { open, sleep, cell, val } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(800)
  await page.evaluate(() => {
    window.__focusLog = []
    const t0 = performance.now()
    document.addEventListener('focusin', (e) => window.__focusLog.push(`${Math.round(performance.now() - t0)} in ${e.target.tagName}.${(e.target.className || '').slice(0, 20)}`), true)
    document.addEventListener('focusout', (e) => window.__focusLog.push(`${Math.round(performance.now() - t0)} out ${e.target.tagName}.${(e.target.className || '').slice(0, 20)}`), true)
    window.__mark = (s) => window.__focusLog.push(`${Math.round(performance.now() - t0)} -- ${s}`)
  })
  await cell(page, 'P00004', 'supplier').dblclick()
  await sleep(500)
  await page.evaluate(() => window.__mark('dblclick P00006'))
  await cell(page, 'P00006', 'supplier').dblclick()
  for (let i = 0; i < 10; i++) {
    await sleep(100)
    await page.evaluate((i) => window.__mark(`t+${i * 100} active=${document.activeElement.tagName}`), i)
  }
  console.log((await page.evaluate(() => window.__focusLog)).join('\n'))
  await browser.close()
})()
