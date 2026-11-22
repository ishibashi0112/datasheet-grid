// 最小の再現: メニューの矢印キーとツールパネルのフォーカス(Shadow とふつうの DOM)
const { open, shot } = require('./lib.cjs')
const URL_ = process.env.URL ?? 'http://localhost:5511/min/index.html'
const NAME = process.env.NAME ?? 'solid'
;(async () => {
  const { browser, page, logs } = await open({ viewport: { width: 900, height: 700 } })
  await page.goto(URL_); await page.waitForTimeout(2000)
  for (const where of ['shadow', 'plain']) {
    const scope = where === 'shadow' ? page.locator('min-grid') : page.locator('#plain')
    const deepFocus = () => page.evaluate(() => { const deep = (d) => d.activeElement?.shadowRoot ? deep(d.activeElement.shadowRoot) : d.activeElement; const a = deep(document); return (a?.className ? String(a.className).split(' ')[0] : a?.tagName) + (a?.textContent?.trim() ? '「' + a.textContent.trim().slice(0, 10) + '」' : '') })
    await scope.locator('[role="row"][data-row-index="1"] [role="gridcell"]').last().click({ position: { x: 20, y: 14 } })
    await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
    const a = ['開く ' + await deepFocus()]
    for (const k of ['ArrowDown', 'ArrowDown']) { await page.keyboard.press(k); await page.waitForTimeout(80); a.push(`${k} ${await deepFocus()}`) }
    console.log(NAME, where, '列メニュー:', a.join(' → '))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.keyboard.press('Shift+F10'); await page.waitForTimeout(400)
    const b = ['開く ' + await deepFocus()]
    for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown']) { await page.keyboard.press(k); await page.waitForTimeout(80); b.push(`${k} ${await deepFocus()}`) }
    console.log(NAME, where, '右クリックメニュー:', b.join(' → '))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.keyboard.press('Shift+F10'); await page.waitForTimeout(400)
    await (where === 'shadow' ? scope : page).locator('[role=menu] [role^=menuitem]', { hasText: 'フィルターを管理' }).first().click(); await page.waitForTimeout(800)
    const c = ['開いた ' + await deepFocus()]
    await page.keyboard.press('Tab'); await page.waitForTimeout(100); c.push('Tab ' + await deepFocus())
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    c.push('Escape ' + await deepFocus())
    console.log(NAME, where, 'ツールパネル:', c.join(' → '))
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  }
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
