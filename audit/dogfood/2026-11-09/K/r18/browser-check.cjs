// 実ブラウザで、テストに書いたのと同じ操作が同じ結果になるか
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:5411'
const MODE = process.env.MODE ?? 'dev'
const OUT = process.env.OUT ?? __dirname
;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-pane="center"].ssg-body-row')
  const r = {}
  const cell = (row, key) => page.locator(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`).first()
  const activeKey = () => page.evaluate(() => { const id = document.querySelector('.ssg-shell').getAttribute('aria-activedescendant'); const el = id && document.getElementById(id); return el ? `${el.closest('.ssg-body-row').getAttribute('data-row-index')}:${el.getAttribute('data-ssg-col-key')}` : null })

  await cell(1, 'qty').dblclick()
  r.editorLabel = await page.locator('.ssg-cell-editor').getAttribute('aria-label')
  await page.keyboard.press('Control+a'); await page.keyboard.type('12'); await page.keyboard.press('Enter')
  r.amount = await cell(1, 'amount').innerText()
  await cell(0, 'name').click(); await page.keyboard.type('Pen'); await page.keyboard.press('Enter')
  r.name = await cell(0, 'name').innerText()
  await cell(0, 'category').click(); await page.keyboard.press('Enter')
  r.selectListbox = await page.getByRole('listbox').count()
  await page.getByRole('option', { name: '電子機器' }).click()
  r.category = await cell(0, 'category').innerText()
  await cell(2, 'qty').click(); await page.keyboard.type('-5'); await page.keyboard.press('Enter')
  r.invalid = await cell(2, 'qty').getAttribute('class')
  await page.getByRole('button', { name: '保存' }).click()
  r.saveMsg = await page.getByTestId('message').innerText()
  // キー
  await cell(0, 'name').click(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight')
  r.k1 = await activeKey()
  await page.keyboard.press('Tab'); r.kTab = await activeKey()
  await page.keyboard.press('End'); r.kEnd = await activeKey()
  await page.keyboard.press('Home'); r.kHome = await activeKey()
  await page.keyboard.press('Control+End'); await page.waitForTimeout(150); r.kCtrlEnd = await activeKey()
  await page.keyboard.press('Control+Home'); await page.waitForTimeout(150); r.kCtrlHome = await activeKey()
  // コピー
  await cell(0, 'name').click(); await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift')
  await page.keyboard.press('Control+c'); r.copy = await page.evaluate(() => navigator.clipboard.readText())
  // 貼り付け
  await page.evaluate(() => navigator.clipboard.writeText('3\t1,200\n4\t９００'))
  await cell(1, 'qty').click(); await page.keyboard.press('Control+v'); await page.waitForTimeout(100)
  r.paste = [await cell(1, 'qty').innerText(), await cell(1, 'price').innerText(), await cell(2, 'qty').innerText(), await cell(2, 'price').innerText()]
  // Alt+↓ → 降順
  await cell(0, 'qty').click(); await page.keyboard.press('Alt+ArrowDown')
  r.menuRole = await page.locator('.ssg-menu-panel').getAttribute('role')
  r.menuButtonNames = await page.locator('.ssg-menu-panel button').evaluateAll((bs) => bs.map((b) => b.textContent))
  await page.getByRole('button', { name: /降順で並び替え/ }).click()
  r.sort = await page.getByTestId('sort').innerText()
  r.firstQty = await cell(0, 'qty').innerText()
  // 列フィルター(set)
  await page.getByRole('button', { name: '倉庫 の列メニュー' }).click({ force: true })
  await page.getByRole('button', { name: 'フィルター…' }).click()
  await page.waitForSelector('.ssg-filter-popover')
  r.filterPopoverRole = await page.locator('.ssg-filter-popover').getAttribute('role')
  r.filterSearchLabel = await page.locator('.ssg-filter-popover input[type="text"]').first().evaluate((el) => el.getAttribute('aria-label') ?? el.labels?.[0]?.textContent ?? null)
  await page.getByRole('checkbox', { name: '大阪' }).click()
  await page.getByRole('button', { name: '閉じる' }).click()
  r.filterSummary = await page.getByTestId('filters').innerText()
  r.rowCountChip = await page.locator('.ssg-bar--top .ssg-bar-chip').first().innerText()
  // 行を追加 → 編集が始まる(並べ替え・絞り込み中)
  await page.getByRole('button', { name: '行を追加' }).click(); await page.waitForTimeout(200)
  r.addEditor = await page.locator('.ssg-cell-editor').count()
  r.addEditorVisible = await page.locator('.ssg-cell-editor').isVisible().catch(() => false)
  await page.keyboard.type('NEW'); await page.keyboard.press('Enter')
  r.count = await page.getByTestId('count').innerText()
  // CSV
  await page.getByRole('button', { name: 'CSV' }).click()
  r.csvHead = await page.evaluate(() => window.__csv.at(-1)?.split('\n').slice(0, 2))
  await page.screenshot({ path: `${OUT}/shot-${MODE}.png` })
  r.logs = logs
  console.log(JSON.stringify(r, null, 2))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
