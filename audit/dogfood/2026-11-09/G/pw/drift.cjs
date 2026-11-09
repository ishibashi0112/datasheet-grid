const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function firstVisible(page) {
  return page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container')
    const r = sc.getBoundingClientRect()
    const hdr = document.querySelector('[role=columnheader]').getBoundingClientRect()
    const rows = [...document.querySelectorAll('[data-pane="center"].ssg-body-row')]
      .map((x) => ({ b: x.getBoundingClientRect(), t: x.querySelector('[role=gridcell]')?.textContent }))
      .filter(({ b }) => b.top >= hdr.bottom - 1 && b.bottom <= r.bottom)
      .sort((a, b) => a.b.top - b.b.top)
    return { firstId: rows[0]?.t, scrollTop: Math.round(sc.scrollTop), scrollHeight: sc.scrollHeight }
  })
}
;(async () => {
  const url = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
  const logs = []
  page.on('console', (m) => logs.push(m.type() + ' ' + m.text()))
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  await page.goto(url)
  await page.waitForSelector('[data-pane="center"].ssg-body-row')
  for (const pos of ['near-bottom', 'middle', 'top']) {
    await page.evaluate((pos) => {
      const g = window.__grid.current
      const n = Number(document.querySelector('.ssg-bar--bottom').innerText.match(/行\s*(\d+)/)[1])
      if (pos === 'top') g.scrollToRow(100, { align: 'start' })
      else if (pos === 'middle') g.scrollToRow(Math.floor(n / 2), { align: 'start' })
      else g.scrollToRow(n - 300, { align: 'start' })
    }, pos)
    await wait(500)
    const before = await firstVisible(page)
    for (let i = 0; i < 4; i++) { await page.click('#add'); await wait(250) }
    await wait(400)
    const after = await firstVisible(page)
    console.log(pos, 'before', JSON.stringify(before), 'after 4×50 rows appended', JSON.stringify(after))
  }
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).join('\n'))
  await browser.close()
})()
