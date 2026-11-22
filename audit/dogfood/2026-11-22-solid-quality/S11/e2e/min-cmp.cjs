// 最小の再現: Shadow / ふつうの DOM で、はみ出しのツールチップ・メモのツールチップ・IME の直接入力を比べる
const { open, shot } = require('./lib.cjs')
const URL_ = process.env.URL ?? 'http://localhost:5511/min/index.html'
const TAG = process.env.TAG ?? 'min-grid'
const NAME = process.env.NAME ?? 'solid'
;(async () => {
  const { browser, context, page, logs } = await open({ viewport: { width: 900, height: 700 } })
  await page.goto(URL_); await page.waitForTimeout(2000)
  for (const where of (process.env.WHERE ?? 'shadow plain').split(' ')) {
    const scope = where === 'shadow' ? page.locator(TAG) : page.locator('#plain')
    const tip = () => page.evaluate(([tag, where]) => {
      const roots = [document, document.querySelector(tag)?.shadowRoot].filter(Boolean)
      for (const r of roots) for (const t of r.querySelectorAll('.ssg-tooltip')) {
        const vis = t.classList.contains('ssg-tooltip--visible')
        const inShadow = r !== document
        return `${vis ? 'visible' : 'hidden'} in=${inShadow ? 'shadow' : 'document'} "${t.textContent.slice(0, 40)}"`
      }
      return 'なし'
    }, [TAG, where])
    const cell = (r) => scope.locator(`[role="row"][data-row-index="${r}"] [role="gridcell"][data-ssg-col-key="name"]`)
    await page.mouse.move(5, 5); await page.waitForTimeout(300)
    await cell(2).hover({ position: { x: 30, y: 10 } }); await page.waitForTimeout(900)
    console.log(NAME, where, 'はみ出し hover →', await tip())
    await page.mouse.move(5, 5); await page.waitForTimeout(400)
    await cell(0).hover({ position: { x: 30, y: 10 } }); await page.waitForTimeout(900)
    console.log(NAME, where, 'メモ hover →', await tip())
    await shot(page, `min-${NAME}-${where}-tip`)
    await page.mouse.move(5, 5); await page.waitForTimeout(400)
    // キーボードのフォーカスでツールチップ
    await cell(3).click({ position: { x: 30, y: 10 } }); await page.waitForTimeout(150)
    await page.mouse.move(5, 5); await page.waitForTimeout(200)
    // IME
    const cdp = await context.newCDPSession(page)
    for (const s of ['て', 'てす', 'テスト']) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length })
    await cdp.send('Input.insertText', { text: 'テスト' }); await page.waitForTimeout(300)
    const ed = await page.evaluate(([tag]) => {
      const roots = [document, document.querySelector(tag)?.shadowRoot]
      for (const r of roots) { const e = r?.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea'); if (e) return `editor value=${JSON.stringify(e.value)}` }
      return 'エディタなし'
    }, [TAG])
    console.log(NAME, where, 'IME 確定 →', ed)
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  }
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
