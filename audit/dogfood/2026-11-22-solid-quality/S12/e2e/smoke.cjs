const { open, shot } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5512/'
  const t0 = Date.now()
  const { browser, page, logs } = await open(url)
  console.log('load', Date.now() - t0, 'ms')
  await page.waitForTimeout(1500)
  await shot(page, 'smoke')
  console.log(await page.evaluate(() => ({ cells: document.querySelectorAll('.ssg-body-cell').length, render: window.__counters.render, peers: document.querySelectorAll('.peer').length })))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('what it means') && !l.includes('agent repair') && !l.includes('deeper evidence') && !l.startsWith('  ')).join('\n'))
  await browser.close()
})()
