// 右クリックメニューとツールチップ: Shadow DOM と iframe(ふつうの DOM)で比べる
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:5511'
;(async () => {
  const { browser, page, logs } = await open({ clipboard: true })
  await page.goto(BASE + (process.env.Q ?? '/?popup=shadow'))
  await page.waitForTimeout(2000)
  for (const target of (process.env.TARGETS ?? 'shadow iframe').split(' ')) {
    const scope = target === 'shadow' ? page.locator('stock-widget') : page.frameLocator('#f1').locator('body')
    const frame = target === 'shadow' ? page : page.frame({ url: /frame\.html/ })
    const cell = (r, c) => scope.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
    const b = await cell(2, 1).boundingBox()
    await page.mouse.click(b.x + 20, b.y + 10, { button: 'right' })
    await page.waitForTimeout(400)
    const menu = await frame.evaluate(() => {
      const all = [...document.querySelectorAll('[role=menu]')]
      const sr = document.querySelector('stock-widget')?.shadowRoot
      if (sr) all.push(...sr.querySelectorAll('[role=menu]'))
      return all.map((m) => m.textContent.slice(0, 60))
    })
    console.log(`${target} 右クリック: ${JSON.stringify(menu)}`)
    await shot(page, `ctx-${target}`)
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    const t = await cell(1, 0).boundingBox()
    await page.mouse.move(t.x + 40, t.y + 10); await page.waitForTimeout(1000)
    const tip = await frame.evaluate(() => {
      const sr = document.querySelector('stock-widget')?.shadowRoot
      const el = document.querySelector('.ssg-tooltip') ?? sr?.querySelector('.ssg-tooltip')
      return el ? `${el.textContent.slice(0, 30)} visible=${getComputedStyle(el).visibility}/${getComputedStyle(el).opacity} in=${el.getRootNode() === document ? 'document' : 'shadow'}` : 'なし'
    })
    console.log(`${target} ツールチップ: ${tip}`)
    await shot(page, `tip-${target}`)
    await page.mouse.move(5, 5); await page.waitForTimeout(300)
  }
  console.log(logs.join('\n'))
  await browser.close()
})()
