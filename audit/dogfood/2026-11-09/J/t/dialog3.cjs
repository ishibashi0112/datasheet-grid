const { open, shot } = require('./lib.cjs')
const { dlgOpen, active, portals, cellPos, cellText, openDialog, hitTest } = require('./dlib.cjs')
const scenarios = {
  async selectMouse(page) {
    const before = await cellText(page, 3, '地域')
    const p = await cellPos(page, 3, '地域')
    await page.mouse.dblclick(p.x, p.y)
    await page.waitForTimeout(400)
    console.log(' open: portals', JSON.stringify(await portals(page)), 'active', await active(page), 'hit', JSON.stringify(await hitTest(page, '.ssg-select-editor-popover')))
    await shot(page, 'dialog-select')
    const ob = await page.locator('[role=option]', { hasText: '九州' }).first().boundingBox()
    await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2)
    await page.waitForTimeout(300)
    console.log(' after click option: before', before, 'now', await cellText(page, 3, '地域'), 'dialog', await dlgOpen(page), 'portals', JSON.stringify(await portals(page)))
  },
  async selectEsc(page) {
    const p = await cellPos(page, 5, '地域')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    console.log(' portals', JSON.stringify(await portals(page)))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' select Esc: dialog', await dlgOpen(page), 'portals', JSON.stringify(await portals(page)))
  },
  async dateTypeEnter(page) {
    const p = await cellPos(page, 1, '契約日')
    await page.mouse.click(p.x, p.y)
    const d0 = await cellText(page, 1, '契約日')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await page.keyboard.type('20250315')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    console.log(' date: before', d0, 'now', await cellText(page, 1, '契約日'), 'dialog', await dlgOpen(page))
  },
  async dateEsc(page) {
    const p = await cellPos(page, 1, '契約日')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' date Esc: dialog', await dlgOpen(page), 'active', await active(page))
  },
  async textEsc(page) {
    const p = await cellPos(page, 2, 'メモ')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.type('abc')
    await page.waitForTimeout(200)
    console.log(' editing active', await active(page))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' text Esc: dialog', await dlgOpen(page), 'active', await active(page), 'memo', JSON.stringify(await cellText(page, 2, 'メモ')))
  },
  async numberLikeEscF2(page) {
    const p = await cellPos(page, 2, '顧客名')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('F2')
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' F2→Esc: dialog', await dlgOpen(page))
  },
  async selectionEsc(page) {
    const p = await cellPos(page, 2, 'メモ')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' selection Esc: dialog', await dlgOpen(page))
  },
  async globalFilterEsc(page) {
    await page.click('[data-testid=dialog] input[placeholder="グローバルフィルター"]')
    await page.keyboard.type('桜')
    await page.waitForTimeout(500)
    console.log(' typed: active', await active(page), 'count', await page.evaluate(() => document.querySelector('[data-testid=dialog] .ssg-root').textContent.match(/行 \d+ \/ \d+/)?.[0]))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' gf Esc: dialog', await dlgOpen(page))
  },
  async ctrlCV(page) {
    const p = await cellPos(page, 0, '顧客名')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(200)
    const q = await cellPos(page, 0, 'メモ')
    await page.mouse.click(q.x, q.y)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(300)
    console.log(' paste memo', JSON.stringify(await cellText(page, 0, 'メモ')), 'clip', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())))
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    console.log(' undo memo', JSON.stringify(await cellText(page, 0, 'メモ')))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    console.log(' Esc after copy (copy-range clear): dialog', await dlgOpen(page))
  },
  async tabOut(page) {
    const p = await cellPos(page, 0, 'メモ')
    await page.mouse.click(p.x, p.y)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    console.log(' Tab from last col: active', await active(page))
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    console.log(' Tab again: active', await active(page))
  },
  async pickAndOk(page) {
    const p = await cellPos(page, 4, '顧客名')
    await page.mouse.click(p.x, p.y)
    const name = await cellText(page, 4, '顧客名')
    await page.click('[data-testid=dialog-ok]')
    await page.waitForTimeout(300)
    console.log(' picked', name, '→ tile', await page.textContent('[data-testid=picked-customer]'), 'dialog', await dlgOpen(page))
  },
}
;(async () => {
  const only = process.argv[2]
  for (const [name, fn] of Object.entries(scenarios)) {
    if (only && only !== name) continue
    const { browser, page, logs } = await open()
    await openDialog(page)
    console.log('==', name)
    try { await fn(page) } catch (e) { console.log(' ERROR', e.message.split('\n')[0]) }
    const l = logs.filter((x) => !x.includes('React DevTools'))
    if (l.length) console.log(' logs:', l.join('\n'))
    await browser.close()
  }
})()
