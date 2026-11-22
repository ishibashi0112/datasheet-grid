// 英語の画面に日本語(CJK と和文の約物)が残っていないか: 各 UI を開いて文字と属性を走査する
const { launch, BASE, openColumnMenu, clickCell, chaos, texts } = require('./lib.cjs')
const scan = (page, label) => page.evaluate((label) => {
  const re = /[　-〿぀-ヿ㐀-鿿＀-￯]/
  const hits = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walker.nextNode())) if (re.test(n.textContent) && !n.parentElement.closest('.nav, .toolbar')) hits.push('text: ' + n.textContent.trim().slice(0, 80))
  for (const el of document.querySelectorAll('*')) for (const a of ['aria-label', 'title', 'placeholder', 'data-ssg-tooltip', 'aria-description', 'aria-roledescription', 'alt'])
    { const v = el.getAttribute(a); if (v && re.test(v)) hits.push(`${a}: ${v.slice(0, 80)}`) }
  return { label, hits: [...new Set(hits)] }
}, label)
;(async () => {
  const { browser, ctx, page, logs } = await launch()
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  await chaos(page, { getFailRate: 0, patchFailRate: 0, getDelay: 50 })
  await page.goto(BASE + '/users')
  await page.locator('.ssg-body-row:not([data-skeleton-row])').first().waitFor()
  const res = []
  res.push(await scan(page, 'initial'))
  // 列メニュー + 固定の小メニュー
  await openColumnMenu(page, 'email')
  await page.locator('[role="menu"] .ssg-menu-item', { hasText: 'Pin column' }).hover(); await page.waitForTimeout(300)
  res.push(await scan(page, 'column menu + pin submenu'))
  await page.locator('[role="menu"] .ssg-menu-item', { hasText: 'Manage sorting…' }).click(); await page.waitForTimeout(600)
  res.push(await scan(page, 'manage sorting (tool panel)'))
  await page.screenshot({ path: 'shot-toolpanel.png' })
  for (const tab of await page.locator('[role="tab"]').all()) { await tab.click(); await page.waitForTimeout(300); res.push(await scan(page, 'tool panel tab ' + (await tab.textContent()))) }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // 各フィルター
  for (const key of ['name', 'role', 'department', 'createdAt', 'logins']) {
    await openColumnMenu(page, key)
    await page.locator('[role="menu"] .ssg-menu-item', { hasText: 'Filter…' }).click(); await page.waitForTimeout(500)
    if (key === 'createdAt') { await page.locator('.ssg-filter-popover .ssg-dp-cal-btn').first().click(); await page.waitForTimeout(300); await page.screenshot({ path: 'shot-calendar.png' }) }
    if (key === 'logins') { await page.locator('.ssg-filter-popover select').selectOption('between'); await page.waitForTimeout(200) }
    res.push(await scan(page, 'filter ' + key))
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  }
  // 右クリックメニュー
  const c = await page.locator('.ssg-body-row[data-row-index="2"] [data-ssg-col-key="email"]').boundingBox()
  await page.mouse.click(c.x + 20, c.y + 10, { button: 'right' }); await page.waitForTimeout(400)
  res.push(await scan(page, 'context menu'))
  await page.screenshot({ path: 'shot-context.png' })
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  // 検索
  await clickCell(page, 1, 'email')
  await page.keyboard.press('Control+f'); await page.waitForTimeout(300)
  await page.keyboard.type('example'); await page.waitForTimeout(800)
  res.push(await scan(page, 'find bar'))
  await page.screenshot({ path: 'shot-find.png' })
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  // 範囲選択(集計)
  await clickCell(page, 1, 'logins'); await page.keyboard.down('Shift'); await clickCell(page, 5, 'logins'); await page.keyboard.up('Shift'); await page.waitForTimeout(500)
  res.push(await scan(page, 'range + aggregates'))
  res.push({ label: 'bottom bar', hits: await texts(page, '.ssg-bar--bottom .ssg-bar-chip, .ssg-bar--bottom span') })
  // エディタ: select / date / number の範囲外
  await clickCell(page, 1, 'role', { dbl: true }); await page.waitForTimeout(300)
  res.push(await scan(page, 'select editor')); await page.keyboard.press('Escape')
  await clickCell(page, 1, 'lastLogin', { dbl: true }); await page.waitForTimeout(300)
  res.push(await scan(page, 'date editor'))
  await page.screenshot({ path: 'shot-date-editor.png' })
  await page.keyboard.press('Escape')
  await clickCell(page, 1, 'logins'); await page.keyboard.type('-5'); await page.keyboard.press('Enter'); await page.waitForTimeout(400)
  await clickCell(page, 1, 'logins'); await page.waitForTimeout(100)
  const lc = await page.locator('.ssg-body-row[data-row-index="1"] [data-ssg-col-key="logins"]').first()
  res.push({ label: 'number min error', hits: [await lc.getAttribute('aria-description'), await lc.getAttribute('data-ssg-tooltip')] })
  await clickCell(page, 1, 'logins'); await page.keyboard.type('1.5'); await page.keyboard.press('Enter'); await page.waitForTimeout(400)
  res.push({ label: 'number integer error', hits: [await lc.getAttribute('aria-description')] })
  // 書き戻し失敗のバー / 取得失敗のバー
  await chaos(page, { patchFailRate: 1 })
  await clickCell(page, 3, 'note'); await page.keyboard.type('x'); await page.keyboard.press('Enter'); await page.waitForTimeout(1300)
  await chaos(page, { getFailRate: 1, patchFailRate: 0 })
  await page.mouse.move(700, 400); for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 5000); await page.waitForTimeout(100) }
  await page.waitForTimeout(1200)
  res.push(await scan(page, 'error bars'))
  await chaos(page, { getFailRate: 0 })
  for (const r of res) console.log(JSON.stringify(r))
  console.log(logs.filter((l) => !/Failed to load resource/.test(l)).join('\n'))
  await browser.close()
})()
