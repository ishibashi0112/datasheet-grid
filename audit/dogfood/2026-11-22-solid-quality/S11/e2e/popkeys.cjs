// キーボードだけで: 列フィルター(Alt+↓ → Enter)と select のエディタ(Enter → ↓ → Enter)。Shadow と iframe
const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? '?popup=shadow'))
  await page.waitForTimeout(2000)
  for (const target of ['shadow', 'iframe']) {
    const scope = target === 'shadow' ? page.locator('stock-widget') : page.frameLocator('#f1').locator('body')
    const frame = target === 'shadow' ? page.mainFrame() : page.frame({ url: /frame\.html/ })
    const deepFocus = () => frame.evaluate(() => { const deep = (d) => d.activeElement?.shadowRoot ? deep(d.activeElement.shadowRoot) : d.activeElement; const a = deep(document); return (a?.className ? String(a.className).split(' ')[0] : a?.tagName) + (a?.textContent?.trim() ? '「' + a.textContent.trim().slice(0, 10) + '」' : '') })
    const bar = () => frame.evaluate(() => ((document.querySelector('stock-widget')?.shadowRoot ?? document).querySelector('.ssg-bar--top')?.textContent ?? '').slice(0, 50))
    const cell = (r, c) => scope.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
    // 列フィルター(カテゴリ)
    await cell(1, 1).click({ position: { x: 20, y: 14 } })
    await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
    await page.keyboard.press('Enter'); await page.waitForTimeout(600)
    const a = ['開いた ' + await deepFocus()]
    await page.keyboard.type('食'); await page.waitForTimeout(200); a.push('「食」' + await deepFocus())
    await page.keyboard.press('Enter'); await page.waitForTimeout(400); a.push('Enter ' + await deepFocus() + ' / ' + await bar())
    await page.keyboard.press('Escape'); await page.waitForTimeout(400); a.push('Escape ' + await deepFocus())
    console.log(target, '列フィルター:', a.join(' → '))
    await page.keyboard.press('Escape')
    // select のエディタ(状態)
    const st = cell(4, 5)
    await st.click({ position: { x: 20, y: 14 } }); const before = (await st.textContent()).trim()
    await page.keyboard.press('Enter'); await page.waitForTimeout(400)
    const b = ['開いた ' + await deepFocus()]
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100); b.push('↓ ' + await deepFocus())
    await page.keyboard.press('Enter'); await page.waitForTimeout(400)
    console.log(target, 'select:', b.join(' → '), `値 ${before} → ${(await st.textContent()).trim()}`, '後', await deepFocus())
  }
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
