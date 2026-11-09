const { chromium } = require('playwright')
;(async () => {
  for (const name of ['radix-dialog', 'native-dialog']) {
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })
    const logs = []
    page.on('console', (m) => logs.push(m.text()))
    page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
    await page.goto(`http://localhost:5410/min/${name}.html`)
    await page.click('#open')
    await page.locator('#dlg .ssg-root').waitFor()
    await page.waitForTimeout(400)
    const open = () => page.evaluate(() => { const d = document.getElementById('dlg'); return !!d && (d.tagName !== 'DIALOG' || d.open) })
    // 列メニューを押す
    const mb = await page.locator('[aria-label="地域 の列メニュー"]').boundingBox()
    await page.mouse.move(mb.x + 2, mb.y + 2)
    await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2)
    await page.waitForTimeout(300)
    const hit = await page.evaluate(() => { const m = document.querySelector('.ssg-menu-panel'); if (!m) return 'no menu'; const r = m.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + 30); return { menuInside: m.contains(h), hitIs: h && (h.className || h.tagName).toString().slice(0, 40), pointerEvents: getComputedStyle(m).pointerEvents } })
    await page.screenshot({ path: `shots/min-${name}-menu.png` })
    const it = await page.locator('.ssg-menu-item', { hasText: 'フィルター…' }).first().boundingBox()
    await page.mouse.click(it.x + it.width / 2, it.y + it.height / 2)
    await page.waitForTimeout(500)
    const filterOpen = await page.evaluate(() => !!document.querySelector('.ssg-filter-popover'))
    console.log(`[${name}] menu hit-test`, JSON.stringify(hit), '/ フィルター… を押した後 filter popover:', filterOpen, '/ dialog open:', await open())
    // Esc で編集を取り消す
    if (!(await open())) { await page.click('#open'); await page.waitForTimeout(300) }
    const c = await page.evaluate(() => { const cell = document.querySelector('#dlg [role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="2"]'); const b = cell.getBoundingClientRect(); return { x: b.x + 20, y: b.y + 10 } })
    await page.mouse.click(c.x, c.y)
    await page.keyboard.type('abc')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(`[${name}] 編集中に Esc → dialog open:`, await open())
    console.log(logs.filter((x) => !x.includes('DevTools')).join('\n'))
    await browser.close()
  }
})()
