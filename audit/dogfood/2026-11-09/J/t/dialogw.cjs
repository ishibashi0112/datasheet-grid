const { open, shot } = require('./lib.cjs')
const { dlgOpen, active, portals, cellPos, cellText, openDialog, hitTest } = require('./dlib.cjs')
async function clickText(page, sel, text) {
  const b = await page.locator(sel, { hasText: text }).first().boundingBox({ timeout: 1500 }).catch(() => null)
  if (!b) return false
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  return true
}
;(async () => {
  for (const mode of (process.argv[2] || 'w1,w2').split(',')) {
    const { browser, page, logs } = await open('?dlg=' + mode)
    await openDialog(page)
    console.log('== mode', mode)
    // 列メニュー → フィルター
    const hb = await page.locator('[data-testid=dialog] [aria-label="地域 の列メニュー"]').boundingBox()
    await page.mouse.move(hb.x + 3, hb.y + 3)
    await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.waitForTimeout(300)
    console.log(' menu hit', JSON.stringify(await hitTest(page, '.ssg-menu-panel')), 'active', await active(page))
    console.log(' click フィルター…', await clickText(page, '.ssg-menu-item', 'フィルター…'))
    await page.waitForTimeout(600)
    console.log(' after: dialog', await dlgOpen(page), 'portals', JSON.stringify(await portals(page)), 'active', await active(page))
    await shot(page, `dialog-${mode}-filter`)
    // フィルターの中の入力欄へ
    const inputs = await page.evaluate(() => [...document.querySelectorAll('body > .ssg-popover input, body > [class*=ssg-filter] input, body > div[class*="ssg-"] input')].map((i) => `${i.type}|${i.placeholder}|${i.getAttribute('aria-label')}`).slice(0, 12))
    console.log(' inputs', JSON.stringify(inputs))
    const search = page.locator('body > div[class*="ssg-"] input[type=text], body > div[class*="ssg-"] input[type=search]').first()
    const sb = await search.boundingBox().catch(() => null)
    if (sb) {
      await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
      await page.waitForTimeout(150)
      console.log(' click search: active', await active(page))
      await page.keyboard.type('関')
      await page.waitForTimeout(300)
      console.log(' typed: value', JSON.stringify(await search.inputValue()), 'active', await active(page))
    }
    await shot(page, `dialog-${mode}-filter-typed`)
    // チェックボックスの「関東」を押す → 適用
    const labels = await page.evaluate(() => [...document.querySelectorAll('body > div[class*="ssg-"] label, body > div[class*="ssg-"] button')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 30))
    console.log(' labels/buttons', JSON.stringify(labels))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' Esc in filter: dialog', await dlgOpen(page), 'portals', JSON.stringify(await portals(page)))
    // 右クリックメニュー
    let p = await cellPos(page, 2, '顧客名')
    await page.mouse.click(p.x, p.y, { button: 'right' })
    await page.waitForTimeout(300)
    console.log(' ctx: active', await active(page))
    await clickText(page, '.ssg-menu-item', '値をコピー')
    await page.waitForTimeout(300)
    console.log(' ctx click: log=', await page.textContent('[data-testid=dialog-log]').catch(() => '(closed)'), 'dialog', await dlgOpen(page))
    // select を押して選ぶ
    const before = await cellText(page, 3, '地域')
    p = await cellPos(page, 3, '地域')
    await page.mouse.dblclick(p.x, p.y)
    await page.waitForTimeout(400)
    await clickText(page, '[role=option]', '九州')
    await page.waitForTimeout(300)
    console.log(' select click: before', before, 'now', await cellText(page, 3, '地域'), 'dialog', await dlgOpen(page))
    // 編集中の Esc
    p = await cellPos(page, 2, 'メモ')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.type('abc')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' edit Esc: dialog', await dlgOpen(page), 'memo', JSON.stringify(await cellText(page, 2, 'メモ')))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' 2nd Esc: dialog', await dlgOpen(page))
    // Alt+Down キーボード列メニュー
    p = await cellPos(page, 0, 'ランク')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Alt+ArrowDown')
    await page.waitForTimeout(300)
    console.log(' Alt+Down: active', await active(page))
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)
    console.log(' after arrows: active', await active(page))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' Esc: dialog', await dlgOpen(page), 'portals', JSON.stringify(await portals(page)), 'active', await active(page))
    // 外側(オーバーレイ)を押すと閉じる
    if (mode === 'w1') { await page.mouse.click(20, 850); await page.waitForTimeout(300); console.log(' overlay click: dialog', await dlgOpen(page)) }
    const l = logs.filter((x) => !x.includes('React DevTools'))
    if (l.length) console.log(' logs:', l.join('\n'))
    await browser.close()
  }
})()
