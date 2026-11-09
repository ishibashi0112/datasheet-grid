const { open, shot, wait, clickVisible } = require('./lib.cjs')
;(async () => {
  const base = process.argv[2] ?? 'http://localhost:5407/'
  const rows = process.argv[3] ?? '1000000'
  const { browser, page, logs } = await open(base + '?rows=' + rows)
  await wait(800)
  for (const where of ['top', 'middle', 'bottom']) {
    await page.evaluate((w) => {
      const g = window.__grid
      if (w === 'top') g.scrollToTop()
      else if (w === 'bottom') g.scrollToBottom()
      else g.scrollToRow(500000, { align: 'start' })
    }, where)
    await wait(600)
    const info = await clickVisible(page, 3, 'center', 1)
    await wait(300)
    const ac = await page.evaluate(() => window.__grid.getActiveCell())
    const bar = (await page.locator('.ssg-bar--bottom').innerText()).replace(/\s+/g, ' ')
    console.log(where, info, { ac, bar })
    await shot(page, `bottomclick-${rows}-${where}`)
  }
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
