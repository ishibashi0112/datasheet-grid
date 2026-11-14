const { open, shot, wait, waitCountChange } = require('./lib.cjs')
async function firstRow(page) {
  return page.evaluate(() => { const hdr = document.querySelector('[role=columnheader]').getBoundingClientRect(); const cs = [...document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')].map((c) => ({ n: Number(c.textContent), t: Math.round(c.getBoundingClientRect().top - hdr.bottom) })).filter((c) => c.t >= -1).sort((a, b) => a.t - b.t); return cs[0] })
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const filtered = process.argv[4] === 'filtered'
  const { browser, page, logs } = await open(url)
  await wait(800)
  if (filtered) {
    await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['WARN', 'ERROR', 'FATAL'] }, service: { kind: 'set', mode: 'include', values: ['checkout'] } } } }))
    await waitCountChange(page, 1000000)
    await wait(500)
  }
  const sc = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(sc.x + sc.width - 6, sc.y + 200)
  await wait(300)
  const th = await page.locator('.ssg-scroll-hint-scrollbar-thumb').boundingBox()
  console.log('thumb', th)
  await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2)
  await page.mouse.down()
  const seq = []
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2 + i * 15)
    await wait(40)
    seq.push((await firstRow(page))?.n)
  }
  await shot(page, `thumb-${tag}-${filtered ? 'f' : 'all'}-dragging`)
  await page.mouse.up()
  await wait(100)
  const a = await firstRow(page)
  await wait(1000)
  const b = await firstRow(page)
  console.log('drag sequence first row', JSON.stringify(seq))
  console.log('after release', JSON.stringify(a), '1s later', JSON.stringify(b))
  await shot(page, `thumb-${tag}-${filtered ? 'f' : 'all'}`)
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
