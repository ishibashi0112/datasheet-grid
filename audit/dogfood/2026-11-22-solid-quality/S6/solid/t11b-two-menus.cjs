// 2 つのグリッドの列メニュー / 右クリックメニューの重なりを細かく見る
const { launch } = require('./lib.cjs')
const BASES = (process.env.BASES ?? 'http://localhost:5506/react/two.html,http://localhost:5506/solid/two.html,http://localhost:5506/two.html').split(',')
;(async () => {
  for (const base of BASES) {
    const tag = base.includes('react') ? 'react' : base.includes('solid/') ? 'solidprod' : 'soliddev'
    const { browser, page, logs } = await launch({ viewport: { width: 1100, height: 900 } })
    await page.goto(base); await page.waitForTimeout(1200)
    const P = { a: '#pane-a', b: '#pane-b' }
    const cellSel = (p, r, k) => `${P[p]} .ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${k}"]`
    const at = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2] }
    const menus = () => page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].map((m) => { const r = m.getBoundingClientRect(); return (m.closest('.ssg-theme-dark') || m.classList.contains('ssg-theme-dark') ? 'dark' : 'light') + ':' + m.textContent.trim().slice(0, 10) + `@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}` }))
    const out = []
    // 1) 右クリック A → 右クリック B
    let [x, y] = await at(cellSel('a', 2, 'value')); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(400); out.push(['A right', await menus()])
    ;[x, y] = await at(cellSel('b', 2, 'value')); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(400); out.push(['then B right', await menus()])
    await page.screenshot({ path: `out/shot-two-ctx-${tag}.png` })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); out.push(['Esc', await menus()])
    // 2) 同じグリッドで列メニュー 2 つ(A item → A memo)
    const openMenu = async (p, key) => { const h = page.locator(`${P[p]} [role="columnheader"][data-ssg-col-key="${key}"]`).first(); const hb = await h.boundingBox(); await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(150); const bb = await h.locator('button[aria-haspopup="menu"]').boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(350) }
    await openMenu('a', 'item'); out.push(['A item menu', await menus()])
    await openMenu('a', 'memo'); out.push(['then A memo menu (same grid)', await menus()])
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); out.push(['Esc', await menus()])
    // 3) グリッドをまたぐ: A item → B memo
    await openMenu('a', 'item'); await openMenu('b', 'memo'); out.push(['A item then B memo', await menus()])
    await page.screenshot({ path: `out/shot-two-colmenus-${tag}.png` })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); out.push(['Esc 1', await menus()])
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); out.push(['Esc 2', await menus()])
    // 4) 列メニュー A を開いたまま B の本体のセルを押す
    await openMenu('a', 'item'); ;[x, y] = await at(cellSel('b', 3, 'memo')); await page.mouse.click(x, y); await page.waitForTimeout(300); out.push(['A menu then click B cell', await menus(), await page.evaluate(() => document.activeElement?.closest('#pane-a,#pane-b')?.id)])
    // 5) 右クリックメニュー A を開いたまま B の列メニュー
    ;[x, y] = await at(cellSel('a', 1, 'value')); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(400); await openMenu('b', 'memo'); out.push(['A ctx then B col menu', await menus()])
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    console.log('#####', tag)
    for (const o of out) console.log(tag, JSON.stringify(o))
    console.log(tag, 'logs:', logs.filter((l) => !/Download the React DevTools/.test(l)).join(' | ').slice(0, 600))
    await browser.close()
  }
})()
