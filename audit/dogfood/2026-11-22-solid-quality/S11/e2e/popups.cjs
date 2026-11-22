// Shadow root の中のグリッド: ポップアップがどこに出て、見た目が付き、押せて、閉じるか
const { open, shot } = require('./lib.cjs')
const Q = process.env.Q ?? '?noframe=1'
const TAG = process.env.TAG ?? 'auto'
;(async () => {
  const { browser, context, page, logs } = await open({ clipboard: true })
  await page.goto('http://localhost:5511/' + Q)
  await page.waitForTimeout(1500)
  const host = 'stock-widget'
  // どこに何が出ているか(document と shadow root の両方を見る)
  const where = (sel) => page.evaluate((sel) => {
    const sr = document.querySelector('stock-widget').shadowRoot
    const inDoc = [...document.querySelectorAll(sel)]
    const inShadow = [...sr.querySelectorAll(sel)]
    const el = inShadow[0] ?? inDoc[0]
    if (!el) return 'なし'
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return `${inShadow.length ? 'shadow' : 'document'} bg=${cs.backgroundColor} pos=${cs.position} font=${cs.fontSize} box=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`
  }, sel)
  const report = []
  const log = async (label, value) => { const v = typeof value === 'function' ? await value() : value; report.push(`${label}: ${v}`); console.log(`${label}: ${v}`) }
  const headerMenu = async (key, title) => {
    await page.locator(`${host} [role=columnheader][data-ssg-col-key="${key}"]`).hover()
    await page.locator(`${host} button[aria-label="${title} の列メニュー"]`).click()
    await page.waitForTimeout(300)
  }
  // 1. 列メニュー
  await headerMenu('category', 'カテゴリ')
  await log('列メニュー', () => where('[role=menu]'))
  await shot(page, `${TAG}-1-menu`)
  // 2. メニューの「フィルター…」を押す
  const item = page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first()
  if (await item.count()) {
    const b = await item.boundingBox(); await page.mouse.click(b.x + 20, b.y + b.height / 2)
    await page.waitForTimeout(400)
  }
  await log('列フィルター', () => where('.ssg-filter-popover'))
  // 3. フィルターの中のチェックボックスを押す(閉じないか)
  const opt = page.locator('.ssg-filter-popover .ssg-filter-option', { hasText: '食品' }).locator('input').first()
  if (await opt.count()) {
    const b = await opt.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300)
  }
  await log('  中のチェックを押した後', () => where('.ssg-filter-popover'))
  await log('  絞り込み', () => page.evaluate(() => document.querySelector('stock-widget').shadowRoot.querySelector('.ssg-bar--top')?.textContent.slice(0, 40)))
  // 検索欄に打つ
  const search = page.locator('.ssg-filter-popover input.ssg-filter-input').first()
  if (await search.count()) { await search.click(); await page.keyboard.type('日'); await page.waitForTimeout(200) }
  await log('  検索欄に打った後', () => where('.ssg-filter-popover'))
  await shot(page, `${TAG}-3-filter`)
  // 4. 外側(ページの見出し)を押して閉じる
  await page.mouse.click(600, 30); await page.waitForTimeout(300)
  await log('  外を押した後', () => where('.ssg-filter-popover'))
  // Escape で閉じる
  await headerMenu('category', 'カテゴリ')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await log('列メニュー → Escape', () => where('[role=menu]'))
  // 5. 右クリックメニュー
  const cell = (r, c) => page.locator(`${host} [data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
  {
    const b = await cell(2, 1).boundingBox(); await page.mouse.click(b.x + 20, b.y + 10, { button: 'right' }); await page.waitForTimeout(300)
  }
  await log('右クリックメニュー', () => where('[role=menu]'))
  await shot(page, `${TAG}-5-context`)
  const copyItem = page.locator('[role=menu] [role^=menuitem]').first()
  await log('  1 つ目の項目', async () => (await copyItem.count()) ? await copyItem.textContent() : 'なし')
  if (await copyItem.count()) { const b = await copyItem.boundingBox(); await page.mouse.click(b.x + 20, b.y + b.height / 2); await page.waitForTimeout(300) }
  await log('  押した後のメニュー', () => where('[role=menu]'))
  await log('  クリップボード', () => page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message)))
  // 6. ツールチップ(長い品名のセルにマウスを乗せる)
  {
    const b = await cell(1, 0).boundingBox(); await page.mouse.move(b.x + 40, b.y + 10); await page.waitForTimeout(900)
  }
  await log('ツールチップ', () => where('.ssg-tooltip'))
  await log('  文字', () => page.evaluate(() => (document.querySelector('.ssg-tooltip') ?? document.querySelector('stock-widget').shadowRoot.querySelector('.ssg-tooltip'))?.textContent?.slice(0, 30)))
  await shot(page, `${TAG}-6-tooltip`)
  // メモの印のツールチップ(品名の 1 行目にメモ)
  {
    const b = await cell(0, 0).boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + 4); await page.waitForTimeout(900)
  }
  await log('メモのツールチップ', () => page.evaluate(() => (document.querySelector('.ssg-tooltip') ?? document.querySelector('stock-widget').shadowRoot.querySelector('.ssg-tooltip'))?.textContent?.slice(0, 30)))
  // 7. select の候補
  {
    const b = await cell(3, 1).boundingBox(); await page.mouse.dblclick(b.x + 20, b.y + 10); await page.waitForTimeout(400)
  }
  await log('select の候補', () => where('.ssg-select-editor-popover'))
  await shot(page, `${TAG}-7-select`)
  const cand = page.locator('.ssg-select-editor-popover [role=option]', { hasText: '家電' }).first()
  if (await cand.count()) { const b = await cand.boundingBox(); await page.mouse.click(b.x + 10, b.y + b.height / 2); await page.waitForTimeout(300) }
  await log('  候補を押した後のセル', async () => (await cell(3, 1).textContent()).trim())
  await log('  候補', () => where('.ssg-select-editor-popover'))
  // 8. ツールパネル(上部バーの「絞り込み」)
  const chip = page.locator(`${host} .ssg-bar--top button.ssg-bar-chip--action`).first()
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(500) }
  await log('ツールパネル', () => where('.ssg-tool-panel, [role=dialog][aria-label]'))
  await shot(page, `${TAG}-8-toolpanel`)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await log('  Escape の後', () => where('.ssg-tool-panel'))
  console.log('\nlogs:\n' + logs.join('\n'))
  await browser.close()
})()
