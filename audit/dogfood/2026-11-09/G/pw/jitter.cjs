const { open, shot, wait, rowCount, waitCountChange } = require('./lib.cjs')
async function anchors(page) {
  return page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container')
    const m = new Map()
    for (const c of document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')) {
      m.set(c.textContent, Math.round(c.getBoundingClientRect().top * 10) / 10)
    }
    return { top: sc.scrollTop, sh: sc.scrollHeight, rows: Object.fromEntries(m) }
  })
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: {
    level: { kind: 'set', mode: 'include', values: ['WARN', 'ERROR', 'FATAL'] },
    service: { kind: 'set', mode: 'include', values: ['checkout'] } } } }))
  const r = await waitCountChange(page, 1000000)
  console.log('filtered', r)
  await wait(800)
  const sc = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(sc.x + 700, sc.y + 300)
  let prev = await anchors(page)
  const jumps = []
  let steps = 0, scrollDeltaSum = 0
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, 240)
    await wait(60)
    const cur = await anchors(page)
    const delta = cur.top - prev.top
    // 共通の行の見た目の移動量
    const moved = Object.keys(cur.rows).filter((k) => k in prev.rows).map((k) => prev.rows[k] - cur.rows[k])
    if (moved.length) {
      const med = moved.sort((a, b) => a - b)[Math.floor(moved.length / 2)]
      const err = Math.abs(med - delta)
      if (err > 2) jumps.push({ i, scrollDelta: Math.round(delta), visualMove: med, sh: cur.sh, shPrev: prev.sh })
    }
    scrollDeltaSum += delta
    steps++
    prev = cur
  }
  console.log('steps', steps, 'scrolled px', Math.round(scrollDeltaSum), 'jumps(visual≠scroll)', jumps.length, JSON.stringify(jumps.slice(0, 10)))
  // scrollHeight の変化(推定 → 実測の補正)
  // スクロールバーをつかんで真ん中へ
  const sb = await page.evaluate(() => { const el = document.querySelector('.ssg-scroll-container'); const b = el.getBoundingClientRect(); return { x: b.right - 6, y: b.top + 20, h: b.height } })
  await page.mouse.move(sb.x, sb.y + 5)
  await page.mouse.down()
  await page.mouse.move(sb.x, sb.y + sb.h / 2, { steps: 8 })
  await page.mouse.up()
  await wait(500)
  const a1 = await anchors(page)
  await wait(1000)
  const a2 = await anchors(page)
  const common = Object.keys(a2.rows).filter((k) => k in a1.rows)
  console.log('after thumb drag: top', Math.round(a1.top), '→ 1s later', Math.round(a2.top), 'sh', a1.sh, a2.sh, 'rows moved', common.slice(0, 3).map((k) => [k, a1.rows[k], a2.rows[k]]))
  await shot(page, `jitter-${tag}-mid`)
  // 末尾へ
  await page.evaluate(() => window.__grid.scrollToBottom())
  await wait(1500)
  const b = await page.evaluate(() => { const el = document.querySelector('.ssg-scroll-container'); return { gap: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop) } })
  const lastNo = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')].map((c) => Number(c.textContent))))
  console.log('scrollToBottom gap', b, 'last row no', lastNo, 'count', await rowCount(page))
  await shot(page, `jitter-${tag}-bottom`)
  // 上へホイールで戻る(下から上は推定行の補正で跳びやすい)
  prev = await anchors(page)
  const upj = []
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -240)
    await wait(60)
    const cur = await anchors(page)
    const delta = cur.top - prev.top
    const moved = Object.keys(cur.rows).filter((k) => k in prev.rows).map((k) => prev.rows[k] - cur.rows[k])
    if (moved.length) {
      const med = moved.sort((a, b) => a - b)[Math.floor(moved.length / 2)]
      if (Math.abs(med - delta) > 2) upj.push({ i, scrollDelta: Math.round(delta), visualMove: med })
    }
    prev = cur
  }
  console.log('wheel up from bottom jumps', upj.length, JSON.stringify(upj.slice(0, 10)))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
