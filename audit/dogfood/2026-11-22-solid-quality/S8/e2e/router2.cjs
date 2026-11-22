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
      portals: [...document.body.children].filter((e) => e.id !== 'root' && e.tagName !== 'SCRIPT').map((e) => e.className || e.tagName).join(','),
    }))
    console.log(label.padEnd(24), JSON.stringify(s))
  }
  await page.goto(`${BASE}/?date=thisMonth`)
  await st('開いた')
  await page.locator('[role=columnheader][data-ssg-col-key="attendees"]').hover()
  await page.locator('button[aria-label="人数 の列メニュー"]').click()
  await page.locator('[role=menu] [role^=menuitem]', { hasText: '降順' }).click()
  await st('人数 降順(メニュー)')
  await page.getByRole('button', { name: '11 月後半' }).click()
  await st('11 月後半ボタン')
  // 範囲の日付を内製の日付フィールドに打つ
  await page.locator('[role=columnheader][data-ssg-col-key="date"]').hover()
  await page.locator('button[aria-label="日付 の列メニュー"]').click()
  await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first().click()
  await page.waitForTimeout(400)
  const inputs = await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-popover input')].map((i) => `${i.getAttribute('aria-label')}=${i.value}`))
  console.log('フィルターの入力欄', inputs)
  const from = page.locator('.ssg-filter-popover input[aria-label="開始日"]')
  await from.fill('')
  await from.type('２０２６／１１／２０')
  await from.press('Enter')
  await st('開始日を全角で')
  const to = page.locator('.ssg-filter-popover input[aria-label="終了日"]')
  await to.fill('')
  await to.type('2026/11/25')
  await to.press('Enter')
  await st('終了日 2026/11/25')
  await shot(page, 'router2-range')
  await page.keyboard.press('Escape')
  await page.goBack(); await st('戻る')
  await page.goBack(); await st('戻る')
  // select の候補を開いたまま戻る
  const sel = page.locator('[data-pane="center"][role="row"][data-row-index="1"] [role="gridcell"]').nth(2)
  await sel.dblclick(); await page.waitForTimeout(300)
  await st('select の候補を開く')
  await page.goBack(); await st('候補を開いたまま戻る')
  await page.locator('nav a', { hasText: '会議室' }).click()
  await st('会議室へ')
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).map((l) => l.slice(0, 200)).join('\n'))
  await browser.close()
})()
