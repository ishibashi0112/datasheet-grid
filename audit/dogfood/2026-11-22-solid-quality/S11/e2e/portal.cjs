// 親から iframe の document へ描いた表: クリック・キー・ドラッグ・ツールチップ・メニュー
const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, context, page, logs } = await open({ clipboard: true })
  await page.goto((process.env.BASE ?? 'http://localhost:5511') + '/portal.html'); await page.waitForTimeout(2500)
  const fr = page.frames().find((f) => f !== page.mainFrame())
  const scope = page.frameLocator('#pf').locator('body')
  const st = () => fr.evaluate(() => {
    const bar = document.querySelector('.ssg-bar--bottom')?.textContent ?? ''
    const a = document.activeElement
    return 'active=' + bar.match(/セル (\S+?)範囲/)?.[1] + ' range=' + bar.match(/範囲 (\S+?)\d+ セル/)?.[1] + ' focus=' + (a?.className ? String(a.className).split(' ')[0] : a?.tagName) + ' editor=' + !!document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea')
  })
  console.log('描けた行', await scope.locator('[data-pane="center"][role="row"]').count())
  const cell = (r, c) => scope.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
  await cell(0, 2).click({ position: { x: 20, y: 14 } }); await page.waitForTimeout(200)
  console.log('クリック', await st())
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100); console.log('↓', await st())
  await page.keyboard.type('7'); await page.waitForTimeout(100); console.log('「7」', await st())
  await page.keyboard.press('Enter'); await page.waitForTimeout(300); console.log('Enter', await st(), '(1,2)=', (await cell(1, 2).textContent()).trim())
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200)
  console.log('Ctrl+C', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message))))
  // ドラッグで範囲
  const a = await cell(0, 2).boundingBox(); const b = await cell(3, 3).boundingBox()
  await page.mouse.move(a.x + 20, a.y + 14); await page.mouse.down(); await page.mouse.move(b.x + 20, b.y + 14, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300)
  console.log('ドラッグ', await st())
  // 列の幅
  const hdr = scope.locator('[role=columnheader][data-ssg-col-key="name"]'); const h = await hdr.boundingBox()
  await page.mouse.move(h.x + h.width - 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + h.width + 50, h.y + h.height / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300)
  console.log('列の幅', Math.round(h.width), '→', Math.round((await hdr.boundingBox()).width))
  // フィルハンドル
  await cell(0, 2).click({ position: { x: 20, y: 14 } }); await page.waitForTimeout(200)
  const fh = scope.locator('.ssg-fill-handle').first()
  if (await fh.count()) { const f = await fh.boundingBox(); const t = await cell(2, 2).boundingBox(); await page.mouse.move(f.x + 3, f.y + 3); await page.mouse.down(); await page.mouse.move(t.x + 30, t.y + 14, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400) }
  console.log('フィル', await Promise.all([0, 1, 2].map(async (r) => (await cell(r, 2).textContent()).trim())))
  // ツールチップ
  await page.mouse.move(5, 5); await page.waitForTimeout(300)
  await cell(2, 0).hover({ position: { x: 40, y: 14 } }); await page.waitForTimeout(900)
  console.log('ツールチップ', await fr.evaluate(() => { const t = document.querySelector('.ssg-tooltip'); return t ? (t.classList.contains('ssg-tooltip--visible') ? 'visible ' : 'hidden ') + t.textContent.slice(0, 20) : 'なし' }))
  // 列メニュー → 矢印
  await cell(1, 1).click({ position: { x: 20, y: 14 } })
  await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
  const f1 = await fr.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 10))
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
  const f2 = await fr.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 10))
  console.log('列メニュー', f1, '→ ↓', f2)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // 右クリック
  const c = await cell(2, 1).boundingBox(); await page.mouse.click(c.x + 20, c.y + 14, { button: 'right' }); await page.waitForTimeout(400)
  console.log('右クリックメニュー', await scope.locator('[role=menu] [role^=menuitem]').allTextContents())
  // 外を押して閉じる(iframe の中の空き)と、親のページを押して閉じる
  await page.mouse.click(5, 10); await page.waitForTimeout(300)
  console.log('  親のページを押した後', await scope.locator('[role=menu]').count())
  // IME
  await cell(5, 0).click({ position: { x: 20, y: 14 } }); await page.waitForTimeout(200)
  const cdp = await context.newCDPSession(page)
  for (const s of ['て', 'テスト']) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length })
  await cdp.send('Input.insertText', { text: 'テスト' }); await page.waitForTimeout(300)
  console.log('IME', await st())
  await page.keyboard.press('Escape')
  await shot(page, 'portal')
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
