const { open, shot } = require('./lib.cjs')
const S = '[data-testid=scale-section]'
async function cellRect(page, rowIdx, colTitle) {
  return page.evaluate(({ rowIdx, colTitle }) => {
    const root = document.querySelector('[data-testid=scale-section] .ssg-root')
    const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮', '').trim() === colTitle)
    const ci = h.getAttribute('aria-colindex')
    const c = root.querySelector(`[role=row][aria-rowindex="${rowIdx + 2}"] [role=gridcell][aria-colindex="${ci}"]`)
    const r = c.getBoundingClientRect(), hr = h.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, text: c.textContent, hcx: hr.x + hr.width / 2, hcy: hr.y + hr.height / 2, hx: hr.x }
  }, { rowIdx, colTitle })
}
const col = (page, title) => page.evaluate((title) => { const root = document.querySelector('[data-testid=scale-section] .ssg-root'); const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮', '').trim() === title); const ci = h.getAttribute('aria-colindex'); return [0,1,2,3,4,5].map((i) => root.querySelector(`[role=row][aria-rowindex="${i + 2}"] [role=gridcell][aria-colindex="${ci}"]`)?.textContent) }, title)
const heads = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid=scale-section] [role=columnheader]')].map((h) => h.textContent.replace('⋮', '').trim()).join(','))
;(async () => {
  for (const scale of ['1', '0.8']) {
    const { browser, page, logs } = await open('?scale=' + scale)
    await page.locator(S).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    console.log(`== scale ${scale}`, 'before', JSON.stringify(await col(page, '件数')))
    const a = await cellRect(page, 0, '件数')
    await page.mouse.click(a.cx, a.cy)
    await page.waitForTimeout(200)
    const fh = await page.evaluate(() => { const e = document.querySelector('[data-testid=scale-section] [class*=fill-handle]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: e.className } })
    const t = await cellRect(page, 3, '件数')
    await page.mouse.move(fh.x, fh.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) { await page.mouse.move(fh.x, fh.y + (t.cy - fh.y) * i / 10); await page.waitForTimeout(16) }
    await page.waitForTimeout(100)
    await shot(page, `scale3-${scale}-fill`, { clip: { x: 0, y: 250, width: 900, height: 450 } })
    await page.mouse.up()
    await page.waitForTimeout(300)
    console.log(' fill to row3 (expect rows 0..3 filled):', JSON.stringify(await col(page, '件数')))
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    // 列の並べ替え: 件数 を 目標 の前へ
    console.log(' heads before', await heads(page))
    const h1 = await cellRect(page, 0, '件数')
    const h2 = await cellRect(page, 0, '目標')
    await page.mouse.move(h1.hcx, h1.hcy)
    await page.waitForTimeout(300)
    const grip = await page.evaluate(() => { const h = [...document.querySelectorAll('[data-testid=scale-section] [role=columnheader]')].find((x) => x.textContent.replace('⋮', '').trim() === '件数'); const g = h.querySelector('.ssg-header-grip'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: g.className } })
    console.log(' grip', JSON.stringify(grip))
    if (grip) {
      await page.mouse.move(grip.x, grip.y)
      await page.mouse.down()
      for (let i = 1; i <= 15; i++) { await page.mouse.move(grip.x + (h2.hx + 5 - grip.x) * i / 15, grip.y); await page.waitForTimeout(20) }
      await shot(page, `scale3-${scale}-coldrag`, { clip: { x: 0, y: 250, width: 900, height: 450 } })
      await page.mouse.up()
      await page.waitForTimeout(500)
      console.log(' heads after drop near 目標 left edge', await heads(page))
    }
    await browser.close()
  }
})()
