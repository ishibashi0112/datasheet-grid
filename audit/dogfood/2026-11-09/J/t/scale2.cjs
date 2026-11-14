const { open, shot } = require('./lib.cjs')
const S = '[data-testid=scale-section]'
async function cellRect(page, rowIdx, colTitle) {
  return page.evaluate(({ rowIdx, colTitle }) => {
    const root = document.querySelector('[data-testid=scale-section] .ssg-root')
    const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮', '').trim() === colTitle)
    const ci = h.getAttribute('aria-colindex')
    const c = root.querySelector(`[role=row][aria-rowindex="${rowIdx + 2}"] [role=gridcell][aria-colindex="${ci}"]`)
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  }, { rowIdx, colTitle })
}
const bar = (page) => page.evaluate(() => { const r = document.querySelector('[data-testid=scale-section] .ssg-root'); const all = [...r.querySelectorAll('*')].filter((e) => e.children.length === 0 && /範囲|セル/.test(e.textContent)); return all.map((e) => e.textContent).join(' | ') })
;(async () => {
  for (const scale of ['1', '0.8', '0.6']) {
    const { browser, page, logs } = await open('?scale=' + scale)
    await page.locator(S).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const a = await cellRect(page, 0, '目標')
    const b = await cellRect(page, 2, '達成率')
    await page.mouse.move(a.cx, a.cy)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) { await page.mouse.move(a.cx + (b.cx - a.cx) * i / 8, a.cy + (b.cy - a.cy) * i / 8); await page.waitForTimeout(16) }
    await page.mouse.up()
    await page.waitForTimeout(200)
    console.log(`scale ${scale}: drag 目標[0] → 達成率[2] (expect B1:D3 = 3列 x 3行):`, await bar(page))
    // Shift+クリック
    await page.mouse.click(a.cx, a.cy)
    await page.keyboard.down('Shift')
    await page.mouse.click(b.cx, b.cy)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(200)
    console.log(`   shift+click:`, await bar(page))
    // 行番号のドラッグ
    await shot(page, `scale2-${scale}`, { clip: { x: 0, y: 250, width: 900, height: 450 } })
    await browser.close()
  }
})()
