const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  for (const v of ['plain', 'layer']) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })
    const logs = []
    page.on('console', (m) => { if (!['debug', 'info'].includes(m.type())) logs.push(m.text()) })
    page.on('pageerror', (e) => logs.push(e.message))
    await page.goto(`http://localhost:5410/min/tw/${v}.html`)
    await page.locator('.ssg-root').first().waitFor()
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => [...document.querySelectorAll('.ssg-root')].map((e) => { const s = getComputedStyle(e); const c = e.querySelector('[role=gridcell]'); return { cls: e.className.split(' ').filter((x) => !x.startsWith('ssg')).join(' '), radius: s.borderTopLeftRadius, bl: s.borderLeftWidth, bb: s.borderBottomWidth, cellColor: c ? getComputedStyle(c).color : null } }))
    console.log(v, JSON.stringify(r), logs.join(' | '))
    await page.close()
  }
  await browser.close()
})()
