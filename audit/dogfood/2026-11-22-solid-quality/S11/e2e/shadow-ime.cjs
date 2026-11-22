const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, context, page, logs } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? '?popup=shadow&noframe=1'))
  await page.waitForTimeout(2000)
  const scope = page.locator('stock-widget')
  await page.evaluate(() => {
    window.__ev = []
    const root = document.querySelector('stock-widget').shadowRoot
    const input = root.querySelector('.ssg-ime-input') ?? root.querySelector('[data-ssg-ime-input]')
    window.__ev.push('input found=' + !!input)
    for (const t of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input']) {
      root.addEventListener(t, (e) => window.__ev.push(`root ${t} target=${e.target.className?.split?.(' ')[0]} data=${e.data ?? ''} composed=${e.composed}`), true)
      document.addEventListener(t, (e) => window.__ev.push(`doc ${t} target=${e.target.tagName}`), true)
    }
  })
  await scope.locator('[data-pane="center"][role="row"][data-row-index="3"] [role="gridcell"]').nth(0).click({ position: { x: 15, y: 14 } })
  await page.waitForTimeout(200)
  const cdp = await context.newCDPSession(page)
  for (const s of ['て', 'てす', 'テスト']) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length })
  await cdp.send('Input.insertText', { text: 'テスト' }); await page.waitForTimeout(300)
  console.log((await page.evaluate(() => window.__ev)).join('\n'))
  console.log(await page.evaluate(() => {
    const root = document.querySelector('stock-widget').shadowRoot
    const ime = root.querySelector('.ssg-ime-input')
    const ed = root.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea')
    return `ime.value=${JSON.stringify(ime?.value)} editor=${!!ed} editor.value=${JSON.stringify(ed?.value)}`
  }))
  // ふつうに 1 文字打つと?
  await page.keyboard.type('a'); await page.waitForTimeout(200)
  console.log('a を打った', await page.evaluate(() => { const r = document.querySelector('stock-widget').shadowRoot; const ed = r.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea'); return `editor=${!!ed} value=${JSON.stringify(ed?.value)}` }))
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http/.test(l)).join('\n'))
  await browser.close()
})()
