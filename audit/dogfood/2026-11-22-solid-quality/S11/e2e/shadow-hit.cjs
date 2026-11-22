const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? '?popup=shadow&noframe=1'))
  await page.waitForTimeout(2000)
  const info = await page.evaluate(() => {
    const root = document.querySelector('stock-widget').shadowRoot
    const out = []
    for (const r of [0, 1, 8, 9]) {
      const row = root.querySelector(`[data-pane="center"][role="row"][data-row-index="${r}"]`)
      const rb = row.getBoundingClientRect()
      const cells = [...row.querySelectorAll('[role="gridcell"]')].slice(0, 3).map((c) => { const b = c.getBoundingClientRect(); return `${c.getAttribute('aria-colindex')}:${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` })
      out.push(`row ${r}: ${Math.round(rb.x)},${Math.round(rb.y)} ${Math.round(rb.width)}x${Math.round(rb.height)} | ${cells.join(' | ')}`)
    }
    const hits = []
    for (const [x, y] of [[171, 211], [171, 535], [300, 232], [471, 232]]) {
      const el = root.elementFromPoint(x, y)
      hits.push(`${x},${y} → ${el?.tagName}.${String(el?.className).slice(0, 60)} ${el?.getAttribute?.('role') ?? ''}`)
    }
    return out.concat(hits).join('\n')
  })
  console.log(info)
  await shot(page, 'shadow-hit', { x: 0, y: 120, width: 1280, height: 460 })
  await browser.close()
})()
