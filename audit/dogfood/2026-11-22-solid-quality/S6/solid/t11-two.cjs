// 1 ページに 2 つのグリッド: キー操作・元に戻す・コピー / 貼り付け・ポップアップ・テーマ・検索が押した方だけに効くか
const { launch } = require('./lib.cjs')
const BASES = (process.env.BASES ?? 'http://localhost:5506/react/two.html,http://localhost:5506/solid/two.html,http://localhost:5506/two.html').split(',')
;(async () => {
  for (const base of BASES) {
    const tag = base.includes('react') ? 'react' : base.includes('solid/') ? 'solidprod' : 'soliddev'
    const { browser, ctx, page, logs } = await launch({ viewport: { width: 1100, height: 900 } })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(base); await page.waitForTimeout(1200)
    const out = []
    const P = { a: '#pane-a', b: '#pane-b' }
    const cellSel = (p, r, k) => `${P[p]} .ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${k}"]`
    const click = async (p, r, k, opts = {}) => { const b = await page.locator(cellSel(p, r, k)).first().boundingBox(); if (opts.right) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' }); else if (opts.dbl) await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2) }
    const state = () => page.evaluate((P) => {
      const one = (sel) => { const root = document.querySelector(sel); const a = root.querySelector('[id$="-active-cell"]'); return { act: a ? `${a.closest('[role=row]')?.getAttribute('aria-rowindex')}/${a.getAttribute('data-ssg-col-key')}` : null, sel: root.querySelectorAll('.ssg-body-cell[aria-selected="true"]').length, editor: root.querySelectorAll('.ssg-cell-editor-input, textarea.ssg-cell-editor-textarea').length, item1: root.querySelector('.ssg-body-row[data-row-index="0"] [data-ssg-col-key="item"]')?.textContent, item2: root.querySelector('.ssg-body-row[data-row-index="1"] [data-ssg-col-key="item"]')?.textContent, marks: root.querySelectorAll('mark.ssg-find-mark').length, findBar: !!root.querySelector('.ssg-find-bar, [class*="find-bar"]'), focusIn: root.contains(document.activeElement) } }
      const portals = [...document.querySelectorAll('body > *')].filter((e) => !e.id && /ssg/.test(e.className)).map((e) => e.className.replace(/\s+/g, ' ').slice(0, 80))
      const menus = [...document.querySelectorAll('[role="menu"]')].map((m) => (m.closest('.ssg-theme-dark') || m.classList.contains('ssg-theme-dark') ? 'dark' : 'light') + ':' + (m.textContent.trim().slice(0, 12)))
      return { a: one(P.a), b: one(P.b), menus, portals, focus: document.activeElement?.className?.toString().slice(0, 40) }
    }, P)
    const rec = async (label) => out.push([label, await state()])
    await click('a', 0, 'item'); await page.keyboard.press('ArrowDown'); await rec('A click + ↓')
    await page.keyboard.type('XA'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); await rec('A edit row2')
    await click('b', 0, 'item'); await page.keyboard.press('ArrowDown'); await rec('B click + ↓')
    await page.keyboard.type('YB'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); await rec('B edit row2')
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200); await rec('B Ctrl+Z')
    await click('a', 3, 'item'); await page.keyboard.press('Control+z'); await page.waitForTimeout(200); await rec('A Ctrl+Z')
    await page.keyboard.press('Control+y'); await page.waitForTimeout(200); await rec('A Ctrl+Y')
    // A でコピー → B へ貼り付け
    await click('a', 1, 'item'); await page.keyboard.press('Control+c'); await page.waitForTimeout(200)
    await click('b', 0, 'item'); await page.keyboard.press('Control+v'); await page.waitForTimeout(300); await rec('copy A row2 → paste B row1')
    await page.keyboard.press('Control+a'); await page.waitForTimeout(200); await rec('B Ctrl+A')
    await page.keyboard.press('Escape'); await page.waitForTimeout(100)
    // 列メニュー: A を開いて B を開く
    const openMenu = async (p, key) => { const h = page.locator(`${P[p]} [role="columnheader"][data-ssg-col-key="${key}"]`).first(); const hb = await h.boundingBox(); await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(150); const bb = await h.locator('button[aria-haspopup="menu"]').boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(350) }
    await openMenu('a', 'item'); await rec('A column menu')
    await openMenu('b', 'memo'); await rec('then B column menu (memo)')
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await click('a', 2, 'value', { right: true }); await page.waitForTimeout(300); await rec('A right-click')
    await click('b', 2, 'value', { right: true }); await page.waitForTimeout(300); await rec('then B right-click')
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); await rec('Esc')
    // select のエディタ(A はダーク、B はライト)
    await click('a', 0, 'result', { dbl: true }); await page.waitForTimeout(400)
    const lb = await page.evaluate(() => { const l = document.querySelector('[role="listbox"]'); return l ? (l.closest('.ssg-theme-dark') || l.classList.contains('ssg-theme-dark') ? 'dark' : 'light') + ' ' + getComputedStyle(l).backgroundColor : null }); out.push(['A select listbox', lb])
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    await click('b', 0, 'result', { dbl: true }); await page.waitForTimeout(400)
    const lb2 = await page.evaluate(() => { const l = document.querySelector('[role="listbox"]'); return l ? (l.closest('.ssg-theme-dark') || l.classList.contains('ssg-theme-dark') ? 'dark' : 'light') + ' ' + getComputedStyle(l).backgroundColor : null }); out.push(['B select listbox', lb2])
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    // 検索(Ctrl+F)は押した方だけ
    await click('b', 0, 'place'); await page.keyboard.press('Control+f'); await page.waitForTimeout(300); await page.keyboard.type('倉庫'); await page.waitForTimeout(600); await rec('B Ctrl+F 倉庫')
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    // Delete は押した方だけ
    await click('a', 4, 'memo'); const beforeB = await page.locator(cellSel('b', 4, 'memo')).first().textContent(); await page.keyboard.press('Delete'); await page.waitForTimeout(200)
    out.push(['A Delete memo row5', await page.locator(cellSel('a', 4, 'memo')).first().textContent(), 'B same cell', beforeB, '→', await page.locator(cellSel('b', 4, 'memo')).first().textContent()])
    // ハンドルの focus() と Tab
    await page.locator('#focus-b').click(); await page.waitForTimeout(200); await page.keyboard.press('ArrowRight'); await rec('focus-b button + →')
    await page.locator('#focus-a').click(); await page.waitForTimeout(200); await page.keyboard.press('ArrowRight'); await rec('focus-a button + →')
    await page.keyboard.press('Tab'); await page.waitForTimeout(200); await rec('Tab from A')
    await page.screenshot({ path: `out/shot-two-${tag}.png` })
    console.log('#####', tag)
    for (const o of out) console.log(tag, JSON.stringify(o))
    console.log(tag, 'logs:', logs.filter((l) => !/solid-performance|Download the/.test(l)).join(' / '))
    await browser.close()
  }
})()
