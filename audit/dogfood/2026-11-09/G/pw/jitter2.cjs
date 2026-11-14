const { open, shot, wait, rowCount, waitCountChange } = require('./lib.cjs')
async function anchors(page) {
  return page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container')
    const m = {}
    for (const c of document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')) m[c.textContent] = Math.round(c.getBoundingClientRect().top * 10) / 10
    return { top: sc.scrollTop, sh: sc.scrollHeight, rows: m }
  })
}
function visualMove(prev, cur) {
  const moved = Object.keys(cur.rows).filter((k) => k in prev.rows).map((k) => prev.rows[k] - cur.rows[k]).sort((a, b) => a - b)
  return moved.length ? moved[Math.floor(moved.length / 2)] : null
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {
    level: { kind: 'set', mode: 'include', values: ['WARN', 'ERROR', 'FATAL'] },
    service: { kind: 'set', mode: 'include', values: ['checkout'] } } } }))
  await waitCountChange(page, 1000000)
  await wait(800)
  // スクロールバーのつまみの位置を探す: 右端の 15px の帯
  const g = await page.evaluate(() => { const el = document.querySelector('.ssg-scroll-container'); const b = el.getBoundingClientRect(); return { right: b.right, top: b.top, bottom: b.bottom, cw: el.clientWidth, ow: el.offsetWidth, ch: el.clientHeight, sh: el.scrollHeight } })
  console.log('scrollbar geometry', g)
  const x = g.right - (g.ow - g.cw) / 2
  // つまみは上端付近。上から少しずつ押して scrollTop が変わらない所 = つまみ
  await page.mouse.move(x, g.top + 22)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) { await page.mouse.move(x, g.top + 22 + (i * (g.ch / 2)) / 10); await wait(30) }
  await page.mouse.up()
  await wait(100)
  const a0 = await anchors(page)
  await wait(1200)
  const a1 = await anchors(page)
  console.log('after thumb drag top', Math.round(a0.top), '→', Math.round(a1.top), 'visual move while idle', visualMove(a0, a1), 'sh', a0.sh, '→', a1.sh)
  await shot(page, `jitter2-${tag}-mid`)
  // 真ん中から上へホイール(未測定の行が上に来る)
  const sc = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(sc.x + 700, sc.y + 300)
  let prev = await anchors(page)
  const out = []
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -240)
    await wait(60)
    const cur = await anchors(page)
    out.push(visualMove(prev, cur))
    prev = cur
  }
  console.log('wheel up from middle: visual moves', JSON.stringify(out))
  prev = await anchors(page)
  const out2 = []
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 240)
    await wait(60)
    const cur = await anchors(page)
    out2.push(visualMove(prev, cur))
    prev = cur
  }
  console.log('wheel down from there: visual moves', JSON.stringify(out2))
  // 行へジャンプ: scrollToRow でまだ測っていない行へ → 位置が合うか
  for (const target of [12000, 20000, 5000]) {
    await page.evaluate((t) => window.__grid.scrollToRow(t, { align: 'start' }), target)
    await wait(80)
    const early = await page.evaluate(() => { const hdr = document.querySelector('[role=columnheader]').getBoundingClientRect(); const cs = [...document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')].map((c) => ({ n: Number(c.textContent), t: c.getBoundingClientRect().top })).filter((c) => c.t >= hdr.bottom - 1).sort((a, b) => a.t - b.t); return cs[0]?.n })
    await wait(1000)
    const late = await page.evaluate(() => { const hdr = document.querySelector('[role=columnheader]').getBoundingClientRect(); const cs = [...document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')].map((c) => ({ n: Number(c.textContent), t: Math.round(c.getBoundingClientRect().top - hdr.bottom) })).filter((c) => c.t >= -1).sort((a, b) => a.t - b.t); return cs[0] })
    console.log('scrollToRow', target, '(row no', target + 1, ') first visible: early', early, 'after 1s', JSON.stringify(late))
  }
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
