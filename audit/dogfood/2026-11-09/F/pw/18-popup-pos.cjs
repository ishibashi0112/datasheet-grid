const { open, shot, handle, appState, clickCell } = require('./lib.cjs')
const log = (...a) => console.log(...a)
;(async () => {
  for (const mode of ['inline', 'portal']) {
    const { browser, page, logs } = await open(mode === 'portal' ? '?popup=portal' : '')
    // 下の方の行(view 15) で編集
    await handle(page, `g.startEditing(15, g.getColIndex('name'))`)
    await page.waitForTimeout(800)
    await shot(page, `18-popup-bottom-${mode}`)
    // 候補をマウスでクリック
    const opt = page.locator('.name-suggest li[role=option]').first()
    const vis = await opt.isVisible()
    const box = await opt.boundingBox()
    log(mode, 'option visible', vis, JSON.stringify(box))
    // elementFromPoint で前面にあるか
    if (box) {
      const top = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el?.className + ' / ' + el?.textContent?.slice(0, 20) }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      log(mode, 'element at option center:', top)
    }
    // 上の方の行(view 2) で開いて候補をクリック
    await page.keyboard.press('Escape')
    await handle(page, `g.startEditing(2, g.getColIndex('name'))`)
    await page.keyboard.press('Control+a')
    await page.keyboard.type('ク')
    await page.waitForTimeout(800)
    await shot(page, `18-popup-top-${mode}`)
    const opt2 = page.locator('.name-suggest li[role=option]').nth(1)
    const t2 = await opt2.innerText()
    const b2 = await opt2.boundingBox()
    await page.mouse.click(b2.x + 40, b2.y + b2.height / 2)
    await page.waitForTimeout(300)
    const st = await appState(page)
    log(mode, 'clicked', t2.replace(/\n/g, ' '), '-> row2', JSON.stringify(st.rows[2]), 'active', JSON.stringify(await handle(page, 'return g.getActiveCell()')), 'focus', await page.evaluate(() => document.activeElement?.className))
    // ホイールで候補をスクロールしてもグリッドがスクロールしないか / 候補リスト内のスクロール
    log(mode, 'LOGS', logs)
    await browser.close()
  }
})()
