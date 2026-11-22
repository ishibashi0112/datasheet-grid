// activeCellFollows="row" の 1 フレームのずれ: 毎フレーム(rAF)にアクティブセルの枠と追う行の DOM の位置を比べる
// 使い方: node t11-tear.cjs <label> <signal|apply>
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2]
  const mode = process.argv[3] ?? 'apply'
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?n=1000&tab=stocks&mode=${mode}`)
  await page.waitForSelector('.ssg-body-cell')
  await sleep(800)
  const th = page.locator('.ssg-header-cell', { hasText: '前日比' })
  await th.hover(); await th.locator('.ssg-icon-btn').last().click(); await sleep(300)
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '降順' }).first().click()
  await sleep(1000)
  const cell = page.locator('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row) [data-ssg-col-key="memo"]').nth(12)
  const key = await cell.evaluate((c) => c.closest('.ssg-body-row').dataset.rowKey)
  await cell.click()
  await sleep(300)
  const res = await page.evaluate(async (key) => {
    const ov = () => document.querySelector('.ssg-active-cell-overlay')
    const row = () => document.querySelector(`.ssg-body-row[data-pane=center][data-row-key="${CSS.escape(key)}"]:not(.ssg-pinned-row)`)
    const base = parseFloat(ov().style.top) - 36 * Number(row().dataset.rowIndex)
    let frames = 0, tear = 0, moves = 0, lastIdx = row()?.dataset.rowIndex, offscreen = 0
    const samples = []
    await new Promise((resolve) => {
      const t0 = performance.now()
      const loop = () => {
        frames++
        const r = row(), o = ov()
        if (!r || !o) offscreen++
        else {
          if (r.dataset.rowIndex !== lastIdx) { moves++; lastIdx = r.dataset.rowIndex }
          const expect = base + 36 * Number(r.dataset.rowIndex)
          if (Math.abs(parseFloat(o.style.top) - expect) > 1) { tear++; if (samples.length < 5) samples.push(`${o.style.top} vs ${expect}`) }
        }
        if (performance.now() - t0 < 10000) requestAnimationFrame(loop)
        else resolve()
      }
      requestAnimationFrame(loop)
    })
    return { frames, moves, tear, offscreen, samples }
  }, key)
  console.log(label, mode, JSON.stringify(res))
  await browser.close()
})()
