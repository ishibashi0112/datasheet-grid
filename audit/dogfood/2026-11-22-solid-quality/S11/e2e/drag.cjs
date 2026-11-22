// マウスのドラッグ(範囲選択・フィルハンドル・列の幅・列の並べ替え)と select のエディタを Shadow と iframe で
const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? '?popup=shadow'))
  await page.waitForTimeout(2000)
  for (const target of ['shadow', 'iframe']) {
    console.log(`\n===== ${target}`)
    const scope = target === 'shadow' ? page.locator('stock-widget') : page.frameLocator('#f1').locator('body')
    const frame = target === 'shadow' ? page.mainFrame() : page.frame({ url: /frame\.html/ })
    const inGrid = (fn) => frame.evaluate((fn) => new Function('root', fn)(document.querySelector('stock-widget')?.shadowRoot ?? document), fn)
    const bar = () => inGrid(`return (root.querySelector('.ssg-bar--bottom')?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 90)`)
    const cell = (r, c) => scope.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
    const box = async (loc) => { await loc.scrollIntoViewIfNeeded(); return loc.boundingBox() }
    const drag = async (from, to, steps = 8) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(400) }
    // 1. 範囲選択(在庫数 1 行目 → 単価 3 行目)
    const a = await box(cell(0, 2)); const b = await box(cell(2, 3))
    await drag({ x: a.x + 20, y: a.y + 14 }, { x: b.x + 20, y: b.y + 14 })
    console.log('範囲選択 →', await bar())
    // 2. フィルハンドル(在庫数 1 行目を選んで、右下の四角を 3 行下へ)
    await cell(0, 2).click({ position: { x: 20, y: 14 } }); await page.waitForTimeout(200)
    const before = await Promise.all([0, 1, 2, 3].map(async (r) => (await cell(r, 2).textContent()).trim()))
    const fh = scope.locator('.ssg-fill-handle').first()
    console.log('フィルハンドルの数', await fh.count())
    if (await fh.count()) {
      const f = await fh.boundingBox(); const t = await box(cell(3, 2))
      await drag({ x: f.x + f.width / 2, y: f.y + f.height / 2 }, { x: t.x + 30, y: t.y + 14 }, 12)
    }
    const after = await Promise.all([0, 1, 2, 3].map(async (r) => (await cell(r, 2).textContent()).trim()))
    console.log('フィル 前', before.join(' | '), '→ 後', after.join(' | '))
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    // 3. 列の幅(品名の見出しの右端を +60px)
    const nameHdr = scope.locator('[role=columnheader][data-ssg-col-key="name"]')
    const h = await box(nameHdr)
    await drag({ x: h.x + h.width - 2, y: h.y + h.height / 2 }, { x: h.x + h.width + 58, y: h.y + h.height / 2 })
    const h2 = await nameHdr.boundingBox()
    console.log('列の幅', Math.round(h.width), '→', Math.round(h2.width))
    // 4. 列の並べ替え(カテゴリの grip を単価の右へ)
    const catHdr = scope.locator('[role=columnheader][data-ssg-col-key="category"]')
    await catHdr.hover(); await page.waitForTimeout(200)
    const grip = catHdr.locator('.ssg-header-grip').first()
    const order0 = await inGrid(`return [...root.querySelectorAll('[data-pane="center"] [role=columnheader][data-ssg-col-key]')].map(e => e.dataset.ssgColKey).join(',')`)
    if (await grip.count()) {
      const g = await grip.boundingBox(); const p = await box(scope.locator('[role=columnheader][data-ssg-col-key="price"]'))
      await drag({ x: g.x + g.width / 2, y: g.y + g.height / 2 }, { x: p.x + p.width - 8, y: p.y + p.height / 2 }, 15)
    } else console.log('  grip なし')
    const order1 = await inGrid(`return [...root.querySelectorAll('[data-pane="center"] [role=columnheader][data-ssg-col-key]')].map(e => e.dataset.ssgColKey).join(',')`)
    console.log('列の並び', order0, '→', order1)
    // 5. select のエディタ(状態の列。ダブルクリック → 候補を押す)
    const st = cell(1, 5)
    console.log('状態 前', (await st.textContent()).trim())
    await st.dblclick({ position: { x: 20, y: 14 } }); await page.waitForTimeout(400)
    const where = await frame.evaluate(() => {
      const sr = document.querySelector('stock-widget')?.shadowRoot
      const s = sr?.querySelector('.ssg-select-editor-popover') ? 'shadow' : document.querySelector('.ssg-select-editor-popover') ? 'document' : 'なし'
      return s
    })
    console.log('  候補の一覧', where)
    const opt = scope.locator('.ssg-select-editor-popover [role=option]', { hasText: '販売終了' }).first()
    if (await opt.count()) { await opt.click(); await page.waitForTimeout(300) }
    console.log('状態 後', (await st.textContent()).trim(), await bar())
    await shot(page, `drag-${target}`)
    await page.keyboard.press('Escape')
  }
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
