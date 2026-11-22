const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch()
  for (const mode of ['value', 'initial', 'row']) {
    const p = await b.newPage()
    const logs = []
    p.on('console', (m) => m.type() === 'warning' && logs.push(m.text().split('\n')[0].slice(0, 120)))
    await p.goto(`${process.argv[2] || 'http://localhost:5509'}/min-ctx.html?mode=${mode}`)
    await p.waitForSelector('.ssg-body-cell')
    const c = await p.$('[role=gridcell][aria-colindex="2"]')
    await c.dblclick()
    await p.waitForTimeout(200)
    await p.keyboard.type('x')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(200)
    console.log(mode, logs.filter((l) => l.includes('STRICT')).length, logs.filter((l) => l.includes('STRICT'))[0] ?? '')
    await p.close()
  }
  await b.close()
})()
