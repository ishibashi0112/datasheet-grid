// Tab / Shift+Tab(編集していないとき)と、最終列の Tab でグリッドの外へ出るか
const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? '?popup=shadow'))
  await page.waitForTimeout(2000)
  // ウィジェットの後ろにフォーカスできるボタンを足す
  await page.evaluate(() => { const b = document.createElement('button'); b.id = 'after'; b.textContent = '後ろのボタン'; document.querySelector('stock-widget').after(b) })
  for (const target of ['shadow', 'iframe']) {
    console.log(`\n===== ${target}`)
    const scope = target === 'shadow' ? page.locator('stock-widget') : page.frameLocator('#f1').locator('body')
    const frame = target === 'shadow' ? page.mainFrame() : page.frame({ url: /frame\.html/ })
    if (target === 'iframe') await frame.evaluate(() => { const b = document.createElement('button'); b.id = 'after'; b.textContent = '後ろのボタン'; document.body.append(b) })
    const status = () => frame.evaluate(() => {
      const root = document.querySelector('stock-widget')?.shadowRoot ?? document
      const bar = root.querySelector('.ssg-bar--bottom')?.textContent ?? ''
      const deep = (d) => d.activeElement?.shadowRoot ? deep(d.activeElement.shadowRoot) : d.activeElement
      const a = deep(document)
      return 'active=' + bar.match(/セル (\S+?)範囲/)?.[1] + ' focus=' + a?.tagName + (a?.id ? '#' + a.id : '.' + String(a?.className).split(' ')[0])
    })
    const cell = (r, c) => scope.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
    await cell(0, 3).click({ position: { x: 20, y: 14 } }); await page.waitForTimeout(150)
    console.log('クリック', await status())
    await page.keyboard.press('Tab'); await page.waitForTimeout(150); console.log('Tab', await status())
    await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(150); console.log('Shift+Tab', await status())
    await page.keyboard.press('End'); await page.waitForTimeout(150); console.log('End', await status())
    await page.keyboard.press('Tab'); await page.waitForTimeout(200); console.log('最終列で Tab', await status())
    await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(200); console.log('戻って Shift+Tab', await status())
  }
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
