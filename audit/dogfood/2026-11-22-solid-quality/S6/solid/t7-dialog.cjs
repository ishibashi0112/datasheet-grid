// ネイティブの <dialog>(showModal)の中のグリッド
const { launch, cell, focused } = require('./lib.cjs')
;(async () => {
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/solid/,http://localhost:5506/').split(',')) {
    const tag = base.includes('react') ? 'react' : base.includes('solid') ? 'solidprod' : 'soliddev'
    const { browser, page, logs } = await launch({})
    await page.goto(base); await page.waitForTimeout(1200)
    const out = []
    const open = () => page.evaluate(() => document.querySelector('dialog').open)
    const hit = (sel) => page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0); if (!e) return 'none'; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return `${e.closest('dialog') ? 'in-dialog' : 'outside'} hit=${e.contains(h) || e === h}` }, sel)
    await page.locator('#open-dialog').click(); await page.waitForTimeout(500)
    const D = 'dialog'
    // 列メニュー
    const hd = page.locator(`${D} [role="columnheader"][data-ssg-col-key="place"]`).first(); const hb = await hd.boundingBox(); await page.mouse.move(hb.x + 10, hb.y + 10); await page.waitForTimeout(200)
    await page.locator(`${D} [role="columnheader"][data-ssg-col-key="place"] button[aria-haspopup="menu"]`).first().click(); await page.waitForTimeout(400)
    out.push('col menu ' + await hit('[role=menu]'))
    await page.locator('[role=menu] [role=menuitem]', { hasText: /フィルター/ }).first().click(); await page.waitForTimeout(500)
    out.push('filter popover ' + await hit('.ssg-filter-popover') + ' focus ' + await focused(page))
    const opt = page.locator('.ssg-filter-popover .ssg-filter-option').nth(1); await opt.click(); await page.waitForTimeout(300)
    out.push('after option click ' + JSON.stringify(await page.evaluate(() => document.querySelector('dialog .ssg-bar-chip')?.parentElement?.textContent)))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    out.push('Esc1 (popover) dialog open=' + await open() + ' popover=' + await page.locator('.ssg-filter-popover').count() + ' focus ' + await focused(page))
    // select エディタ
    await cell(page, 1, 'result', D).dblclick(); await page.waitForTimeout(400)
    out.push('select popover ' + await hit('.ssg-select-editor-popover'))
    await page.locator('[role=option]').nth(2).click(); await page.waitForTimeout(300)
    out.push('selected ' + await cell(page, 1, 'result', D).textContent())
    // number エディタで Escape
    await cell(page, 2, 'value', D).dblclick(); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    out.push('Esc in editor dialog open=' + await open())
    // 右クリックメニュー
    await cell(page, 3, 'item', D).click({ button: 'right' }); await page.waitForTimeout(400)
    out.push('ctx menu ' + await hit('[role=menu]'))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    out.push('Esc ctx dialog open=' + await open())
    // 範囲を選んで Escape → 選択解除だけ、もう一度 Escape → ダイアログが閉じる
    await cell(page, 2, 'item', D).click(); await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(200)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    out.push('Esc range dialog open=' + await open() + ' selected=' + await page.locator(`${D} [aria-selected=true]`).count())
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    out.push('Esc single dialog open=' + await open() + ' focus ' + await focused(page))
    // もう一度開いて編集 → Ctrl+Z
    await page.locator('#open-dialog').click(); await page.waitForTimeout(500)
    await cell(page, 0, 'item', D).click(); await page.keyboard.type('Z'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    out.push('typed ' + await cell(page, 0, 'item', D).textContent())
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    out.push('undo ' + await cell(page, 0, 'item', D).textContent())
    await page.locator('#close-dialog').click(); await page.waitForTimeout(300)
    out.push('closed by button open=' + await open())
    for (const o of out) console.log(tag, o)
    console.log(tag, 'logs:', logs.filter((l) => !/solid-performance|Download the/.test(l)).join(' / '))
    await browser.close()
  }
})()
