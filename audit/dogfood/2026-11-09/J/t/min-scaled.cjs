const { chromium } = require('playwright')
;(async () => {
  for (const scale of ['1', '0.8']) {
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
    await page.goto(`http://localhost:5410/min/scaled.html?scale=${scale}`)
    await page.locator('.ssg-root').waitFor()
    await page.waitForTimeout(500)
    const cell = (r, c) => page.evaluate(([r, c]) => { const e = document.querySelector(`[role=row][aria-rowindex="${r + 2}"] [role=gridcell][aria-colindex="${c + 2}"]`); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.right, b: b.bottom } }, [r, c])
    const bar = () => page.evaluate(() => document.querySelector('.ssg-bar--bottom').textContent)
    // 1) A1 から C3 までドラッグ
    const a = await cell(0, 0), c = await cell(2, 2)
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(c.x, c.y, { steps: 10 }); await page.mouse.up()
    await page.waitForTimeout(200)
    const sel = await bar()
    // 2) A1 のフィルハンドルを A4 の中央まで
    await page.mouse.click(a.x, a.y)
    await page.waitForTimeout(150)
    const fh = await page.evaluate(() => { const r = document.querySelector('[class*=fill-handle]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    const a4 = await cell(3, 0)
    await page.mouse.move(fh.x, fh.y); await page.mouse.down(); await page.mouse.move(a4.x, a4.y, { steps: 10 }); await page.mouse.up()
    await page.waitForTimeout(300)
    const colA = await page.evaluate(() => [0, 1, 2, 3, 4].map((i) => document.querySelector(`[role=row][aria-rowindex="${i + 2}"] [role=gridcell][aria-colindex="2"]`).textContent))
    // 3) A 列の右端を 100px 右へ
    const h = await page.evaluate(() => { const e = [...document.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮', '').trim() === 'A'); const b = e.getBoundingClientRect(); return { r: b.right, y: b.y + b.height / 2, w: b.width } })
    await page.mouse.move(h.r - 2, h.y); await page.mouse.down(); await page.mouse.move(h.r - 2 + 100, h.y, { steps: 10 }); await page.mouse.up()
    await page.waitForTimeout(200)
    const h2 = await page.evaluate(() => { const e = [...document.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮', '').trim() === 'A'); const b = e.getBoundingClientRect(); return { r: b.right, w: b.width } })
    console.log(`scale ${scale}: A1→C3 のドラッグ = ${sel.match(/範囲 \S+/)?.[0]} / A1 のフィルを A4 まで = [${colA.join(',')}] / 列の右端を +100px: 画面上の幅 ${h.w.toFixed(0)}→${h2.w.toFixed(0)}、ポインタ ${(h.r + 98).toFixed(0)} に対し右端 ${h2.r.toFixed(0)}`)
    await browser.close()
  }
})()
