// URL とグリッドの状態の同期(ボタン / フィルターの画面 / ソート / 戻る・進む / ページの行き来)
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
;(async () => {
  const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
  const st = async (label) => {
    await page.waitForTimeout(700)
    const s = await page.evaluate(() => ({
      url: location.pathname + decodeURIComponent(location.search),
      bar: [...document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')].map((e) => e.textContent.trim()).join(' | '),
      first: document.querySelector('[data-pane="left"][role="row"][data-row-index="0"]')?.textContent.trim(),
      pressed: [...document.querySelectorAll('.toolbar button[aria-pressed=true]')].map((b) => b.textContent).join(','),
      portals: [...document.body.children].filter((e) => e.id !== 'root' && e.tagName !== 'SCRIPT').map((e) => e.className || e.tagName).join(','),
      grids: document.querySelectorAll('.ssg-root').length,
    }))
    console.log(label.padEnd(28), JSON.stringify(s))
    return s
  }
  const openFilter = async (key, title) => {
    await page.locator(`[role=columnheader][data-ssg-col-key="${key}"]`).hover()
    await page.locator(`button[aria-label="${title} の列メニュー"]`).click()
    await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first().click()
    await page.waitForTimeout(400)
  }
  await page.goto(`${BASE}/?date=thisMonth`)
  await st('1 開いた thisMonth')
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await st('2 「今日」ボタン')
  await openFilter('date', '日付')
  await page.locator('.ssg-filter-popover .ssg-filter-preset-chip', { hasText: '過去 30 日' }).click()
  await st('3 フィルターで過去30日')
  await page.keyboard.press('Escape')
  // 人数の見出しを押して並び替え
  const h = page.locator('[role=columnheader][data-ssg-col-key="attendees"] .ssg-header-label')
  await h.click()
  await st('4 人数の見出しを押す')
  await openFilter('room', '部屋')
  // 部屋: 「すべて選択」を外して 会議室 A だけ
  await page.locator('.ssg-filter-popover .ssg-filter-selectall input').click()
  await page.locator('.ssg-filter-popover .ssg-filter-option', { hasText: '会議室 A' }).locator('input').click()
  await st('5 部屋 A だけ')
  await page.keyboard.press('Escape')
  await page.goBack(); await st('6 戻る')
  await page.goBack(); await st('7 戻る')
  await page.goBack(); await st('8 戻る')
  await page.goForward(); await st('9 進む')
  // 編集中にページを移る
  const c = page.locator('[data-pane="center"][role="row"][data-row-index="0"] [role="gridcell"]').nth(4)
  await c.dblclick(); await page.keyboard.type('打ちかけ')
  await page.locator('nav a', { hasText: '会議室' }).click()
  await st('10 編集中に会議室へ')
  await page.goBack(); await st('11 戻る(付け直し)')
  // フィルターを開いたまま戻る
  await openFilter('date', '日付')
  await page.goBack(); await st('12 フィルターを開いたまま戻る')
  await shot(page, 'router-12')
  await page.keyboard.press('Escape')
  await openFilter('date', '日付')
  await page.locator('nav a', { hasText: '会議室' }).click()
  await st('13 フィルターを開いたまま会議室へ')
  await shot(page, 'router-13')
  await page.goBack(); await st('14 戻る')
  // 列メニュー / 右クリックメニュー / select の候補を開いたままページを移る
  await page.locator('[role=columnheader][data-ssg-col-key="room"]').hover()
  await page.locator('button[aria-label="部屋 の列メニュー"]').click()
  await page.locator('nav a', { hasText: '会議室' }).click()
  await st('15 列メニューを開いたまま移る')
  await page.goBack(); await page.waitForTimeout(500)
  const rc = page.locator('[data-pane="center"][role="row"][data-row-index="1"] [role="gridcell"]').nth(3)
  await rc.click({ button: 'right' })
  await page.waitForTimeout(300)
  await page.locator('nav a', { hasText: '会議室' }).click()
  await st('16 右クリックメニューで移る')
  await page.goBack(); await page.waitForTimeout(500)
  const sel = page.locator('[data-pane="center"][role="row"][data-row-index="1"] [role="gridcell"]').nth(2)
  await sel.dblclick(); await page.waitForTimeout(300)
  await st('17 select の候補を開く')
  await page.goBack(); await st('18 候補を開いたまま戻る')
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).map((l) => l.slice(0, 400)).join('\n'))
  await browser.close()
})()
