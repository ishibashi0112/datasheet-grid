// キー操作・編集・コピー / 貼り付け・検索・IME・フィルハンドル(Shadow DOM と iframe)
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:5511'
;(async () => {
  const { browser, context, page, logs } = await open({ clipboard: true })
  await page.goto(BASE + (process.env.Q ?? '/?popup=shadow'))
  await page.waitForTimeout(2000)
  for (const target of (process.env.TARGETS ?? 'shadow iframe').split(' ')) {
    console.log(`\n===== ${target}`)
    const scope = target === 'shadow' ? page.locator('stock-widget') : page.frameLocator('#f1').locator('body')
    const frame = target === 'shadow' ? page.mainFrame() : page.frame({ url: /frame\.html/ })
    const inGrid = (fn, arg) => frame.evaluate(([fn, arg]) => {
      const root = document.querySelector('stock-widget')?.shadowRoot ?? document
      return new Function('root', 'arg', fn)(root, arg)
    }, [fn, arg])
    const status = () => inGrid(`
      const bar = root.querySelector('.ssg-bar--bottom')?.textContent ?? ''
      const active = bar.match(/セル (\\S+?)範囲/)?.[1]
      const deep = (d) => d.activeElement?.shadowRoot ? deep(d.activeElement.shadowRoot) : d.activeElement
      const a = deep(document)
      return 'active=' + active + ' focus=' + (a ? a.tagName + (a.className ? '.' + String(a.className).split(' ')[0] : '') + (a.dataset?.ssgImeInput !== undefined ? '[ime]' : '') : 'null') + ' editor=' + !!root.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea')`)
    const cell = (r, c) => scope.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
    const text = async (r, c) => (await cell(r, c).textContent()).trim()
    const click = async (r, c) => { await cell(r, c).click({ position: { x: 15, y: 14 } }); await page.waitForTimeout(150) }
    // 在庫数(列 2)の 1 行目をクリック → ↓ ↓ → 「12」Enter
    await click(0, 2)
    console.log('クリック', await status())
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
    console.log('↓↓', await status())
    await page.keyboard.type('12')
    console.log('「12」', await status())
    await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    console.log('Enter 後', await status(), 'セル(2,2)=', await text(2, 2))
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100)
    console.log('→', await status())
    // F2 で編集して Tab
    await page.keyboard.press('F2'); await page.keyboard.type('5'); await page.keyboard.press('Tab'); await page.waitForTimeout(300)
    console.log('F2 5 Tab', await status(), 'セル(3,3)=', await text(3, 3))
    // ダブルクリックで編集 → 確定は Escape
    await cell(4, 0).dblclick({ position: { x: 15, y: 14 } }); await page.waitForTimeout(200)
    await page.keyboard.type('X'); await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    console.log('dbl X Esc', await status())
    await page.keyboard.press('ArrowDown')
    console.log('↓', await status())
    // コピー / 貼り付け
    await click(0, 2)
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift')
    await page.keyboard.press('Control+c'); await page.waitForTimeout(300)
    console.log('Ctrl+C →', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())))
    await click(6, 2)
    await page.keyboard.press('Control+v'); await page.waitForTimeout(300)
    console.log('Ctrl+V → (6,2)=', await text(6, 2), '(7,2)=', await text(7, 2))
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    console.log('Ctrl+Z → (6,2)=', await text(6, 2))
    // Delete
    await click(8, 2); await page.keyboard.press('Delete'); await page.waitForTimeout(200)
    console.log('Delete → (8,2)=', JSON.stringify(await text(8, 2)))
    // 検索 Ctrl+F
    await click(0, 0)
    await page.keyboard.press('Control+f'); await page.waitForTimeout(300)
    const findOpen = await inGrid(`return !!root.querySelector('.ssg-find-bar, [role=search]')`)
    const findOutside = await frame.evaluate(() => !!document.querySelector('.ssg-find-bar'))
    console.log('Ctrl+F 検索バー', findOpen, '(document 側)', findOutside, await status())
    await page.keyboard.type('タオル'); await page.waitForTimeout(500)
    console.log('  打った', await inGrid(`return root.querySelectorAll('mark.ssg-find-mark').length + ' marks / ' + (root.querySelector('.ssg-find-bar')?.textContent ?? '')`))
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    console.log('  Escape', await status())
    // IME(imeDirectInput)で品名に日本語
    await click(9, 0)
    const cdp = await context.newCDPSession(page)
    console.log('IME 前', await status())
    for (const s of ['て', 'てす', 'てすと']) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length })
    await cdp.send('Input.imeSetComposition', { text: 'テスト', selectionStart: 3, selectionEnd: 3 })
    await cdp.send('Input.insertText', { text: 'テスト' }); await page.waitForTimeout(200)
    console.log('IME 確定', await status())
    await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    console.log('Enter → (9,0)=', await text(9, 0))
    await shot(page, `kbd-${target}`)
    await page.keyboard.press('Escape')
  }
  console.log(logs.join('\n'))
  await browser.close()
})()
