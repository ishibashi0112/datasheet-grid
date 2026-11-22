// メニューの矢印キーとツールパネルのフォーカス: Shadow とふつうの DOM(iframe)で比べる
const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? '?popup=shadow'))
  await page.waitForTimeout(2000)
  for (const target of ['shadow', 'iframe']) {
    console.log(`\n===== ${target}`)
    const scope = target === 'shadow' ? page.locator('stock-widget') : page.frameLocator('#f1').locator('body')
    const frame = target === 'shadow' ? page.mainFrame() : page.frame({ url: /frame\.html/ })
    const deepFocus = () => frame.evaluate(() => { const deep = (d) => d.activeElement?.shadowRoot ? deep(d.activeElement.shadowRoot) : d.activeElement; const a = deep(document); return a?.tagName + '.' + String(a?.className).split(' ')[0] + ' ' + (a?.textContent?.trim().slice(0, 14) ?? '') })
    await scope.locator(`[data-pane="center"][role="row"][data-row-index="2"] [role="gridcell"]`).nth(1).click({ position: { x: 20, y: 14 } })
    await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
    const seq = ['開く ' + await deepFocus()]
    for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) { await page.keyboard.press(k); await page.waitForTimeout(80); seq.push(`${k} ${await deepFocus()}`) }
    console.log('列メニュー:', seq.join(' → '))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.keyboard.press('Shift+F10'); await page.waitForTimeout(400)
    const seq2 = ['開く ' + await deepFocus()]
    for (const k of ['ArrowDown', 'ArrowDown']) { await page.keyboard.press(k); await page.waitForTimeout(80); seq2.push(`${k} ${await deepFocus()}`) }
    console.log('右クリックメニュー:', seq2.join(' → '))
    // Enter で「フィルターを管理…」を選ぶ(↓ の位置にあれば)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    await page.keyboard.press('Shift+F10'); await page.waitForTimeout(400)
    await scope.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルターを管理' }).click(); await page.waitForTimeout(800)
    console.log('ツールパネルを開いた後の focus:', await deepFocus())
    await page.keyboard.press('Tab'); await page.waitForTimeout(100)
    console.log('  Tab:', await deepFocus())
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    console.log('  Escape:', await deepFocus())
  }
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
