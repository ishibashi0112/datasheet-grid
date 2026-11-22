// 自作の上部 / 下部バー: 文脈の値の追従・入力欄のフォーカス・作り直し
const { open, click, shot } = require('./lib.cjs')
const BASE = process.env.BASE || 'http://localhost:5501/'
;(async () => {
  const modes = (process.argv[2] || 'jsx,body,destructure,mixed').split(',')
  for (const mode of modes) {
    const { browser, page, logs, context } = await open(`${BASE}bars.html?mode=${mode}`)
    const cdp = await context.newCDPSession(page)
    const st = (label) =>
      page.evaluate((label) => {
        const top = document.querySelector('[data-testid="my-top"]')
        const bottom = document.querySelector('[data-testid="my-bottom"]')
        const input = document.getElementById('my-filter')
        return {
          label,
          calls: { ...window.__barCalls },
          count: document.getElementById('my-count')?.textContent,
          sort: document.getElementById('my-sort')?.textContent,
          filters: document.getElementById('my-filters')?.textContent,
          active: document.getElementById('my-active')?.textContent,
          range: document.getElementById('my-range')?.textContent,
          agg: document.getElementById('my-agg')?.textContent,
          ac: document.getElementById('my-activecell')?.textContent,
          inputValue: input?.value,
          focusIsInput: document.activeElement === input,
          focus: document.activeElement?.id || document.activeElement?.className,
          topSame: top?.__mark === 'top0',
          bottomSame: bottom?.__mark === 'bottom0',
          inputSame: input?.__mark === 'input0',
          gridFilter: window.__barGrid?.getState().filters.globalText,
        }
      }, label)
    const mark = () =>
      page.evaluate(() => {
        const t = document.querySelector('[data-testid="my-top"]')
        const b = document.querySelector('[data-testid="my-bottom"]')
        const i = document.getElementById('my-filter')
        if (t) t.__mark = 'top0'
        if (b) b.__mark = 'bottom0'
        if (i) i.__mark = 'input0'
      })
    const out = []
    out.push(await st('load'))
    await mark()
    // 1) 入力欄に 1 文字ずつ打つ(ASCII)
    await page.click('#my-filter')
    await page.keyboard.type('P-0001', { delay: 30 })
    await page.waitForTimeout(400)
    out.push(await st('typed P-0001 (delay 30)'))
    // 2) 速く打つ(delay 0)
    await page.click('#my-filter')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300)
    await mark()
    await page.keyboard.type('P-00012', { delay: 0 })
    await page.waitForTimeout(500)
    out.push(await st('typed P-00012 fast'))
    // 3) IME(CDP)
    await page.click('#my-filter')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300)
    await mark()
    await cdp.send('Input.imeSetComposition', { text: 'せんぷうき', selectionStart: 5, selectionEnd: 5 })
    await page.waitForTimeout(250)
    out.push(await st('ime composing'))
    await cdp.send('Input.insertText', { text: '扇風機' })
    await page.waitForTimeout(400)
    out.push(await st('ime committed 扇風機'))
    // 4) 空にしてからソート(ハンドル)
    await page.click('#my-filter')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(400)
    await mark()
    await page.evaluate(() => window.__barGrid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] }))
    await page.waitForTimeout(300)
    out.push(await st('sorted qty desc'))
    // 5) セルを押す → 下部バー
    await mark()
    await click(page, 3, 5)
    await page.waitForTimeout(200)
    out.push(await st('click r2 qty'))
    await page.keyboard.down('Shift')
    await click(page, 6, 6)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(300)
    out.push(await st('shift-click range'))
    // 6) 編集すると件数・集計は?(qty を書き換える)
    await click(page, 3, 5)
    await page.keyboard.type('5')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    out.push(await st('edited qty'))
    // 7) 列フィルター(ハンドル)→ filters 表示
    await page.evaluate(() =>
      window.__barGrid.applyState({ filters: { globalText: '', columnFilters: { category: { kind: 'set', mode: 'include', values: ['food'] } } } }),
    )
    await page.waitForTimeout(300)
    out.push(await st('column filter food'))
    // 8) 入力欄にフォーカスがあるまま、グリッドの外から rows を変える(行の追加)
    await page.click('#my-filter')
    await page.keyboard.type('緑', { delay: 20 })
    await page.waitForTimeout(300)
    await mark()
    await page.evaluate(() => window.__barGrid.applyRows((prev) => [...prev, { ...prev[0], id: 9999, code: 'X-9999', name: '緑茶 追加' }]))
    await page.waitForTimeout(300)
    out.push(await st('rows added while typing'))
    await shot(page, `t20-bars-${mode}`)
    console.log(`===== mode=${mode}`)
    for (const o of out) console.log(JSON.stringify(o))
    const ls = logs.filter((l) => !l.includes('[vite]'))
    console.log('LOGS', ls.length, ls.slice(0, 8).map((l) => l.slice(0, 300)).join('\n'))
    await browser.close()
  }
})()