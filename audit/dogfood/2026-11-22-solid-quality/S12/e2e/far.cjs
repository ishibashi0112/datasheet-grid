// 横の仮想化で遠くへ(ボタン = scrollToCell / Ctrl+End / Shift+ホイールの連打)、ツールパネルの「列」での非表示・並べ替えの後の選択とフォーカス
const { open, shot } = require('./lib.cjs')
;const outRef = []
process.on('unhandledRejection', (e) => { for (const o of outRef) console.log(JSON.stringify(o)); console.log('ERR', e.message); process.exit(1) })
;(async () => {
  const base = process.argv[2] || 'http://localhost:5512/'
  const tag = process.argv[3] || 'solid'
  const { browser, page, logs } = await open(`${base}?peer=jsx`)
  const out = outRef
  const g = (fn, arg) => page.evaluate(fn, arg)
  const cellAt = (rowKey, colKey) =>
    g(({ rowKey, colKey }) => {
      const h = window.__app.grid
      const r = h.getViewRowIndex(rowKey)
      const c = h.getColIndex(colKey)
      const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root')
      const el = root.querySelector(`[role="row"][aria-rowindex="${r + 2}"] [role="gridcell"][aria-colindex="${c + 2}"]`)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: el.textContent }
    }, { rowKey, colKey })
  const act = () => g(() => { const a = document.activeElement; return `${a?.tagName}.${(a?.className || '').toString().slice(0, 40)}` })
  const state = () => g(() => { const h = window.__app.grid; const a = h.getActiveCell(); const cols = window.__app.columns(); const keyAt = (i) => { for (const c of cols) if (h.getColIndex(c.key) === i) return c.key; return '?' }; const s = h.getSelection(); return { active: a && `${a.row}:${a.col}=${keyAt(a.col)}`, sel: s && JSON.stringify(s.range ?? s) } })
  // 見えている中央ペインの帯: 見出しと本体の左端の列がそろっているか、空のセル(描かれていない)があるか
  const view = () => g(() => {
    const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root')
    const sc = root.querySelector('.ssg-body-viewport, [class*=viewport]')
    const vis = [...root.querySelectorAll('[role=gridcell]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > 0 && b.left < innerWidth && b.bottom > 140 && b.top < innerHeight })
    const blanks = vis.filter((e) => e.textContent === '').length
    const hdrs = [...root.querySelectorAll('[role=columnheader]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left > 330 && b.right < 1300 })
    const h0 = hdrs[0]
    const hc = h0?.getAttribute('aria-colindex')
    const bodyCell = h0 && [...root.querySelectorAll(`[role=gridcell][aria-colindex="${hc}"]`)][0]
    return { pos: window.__app.grid.getScrollPosition(), visCells: vis.length, blanks, headerFirst: h0?.textContent, headerLeft: h0 && Math.round(h0.getBoundingClientRect().left), bodyLeft: bodyCell && Math.round(bodyCell.getBoundingClientRect().left), domCells: root.querySelectorAll('[role=gridcell]').length }
  })

  // 1. ボタンで 2026/12 へ
  let c = await cellAt(5, 'm201103')
  await page.mouse.click(c.x, c.y)
  let t0 = Date.now()
  await page.click('[data-testid=far]')
  await page.waitForTimeout(50)
  out.push(['far +50ms', await view()])
  await page.waitForTimeout(400)
  out.push(['far +450ms', await view(), Date.now() - t0])
  await shot(page, `far-${tag}`)
  // そこで編集
  c = await cellAt(6, 'm202612')
  out.push(['m202612 cell', c && c.text])
  if (c) {
    await page.mouse.click(c.x, c.y)
    await page.keyboard.type('4321')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(150)
    out.push(['edit far', await g(() => window.__app.rows()[5].v[191]), await state()])
  }
  // 2. Ctrl+End / Ctrl+Home
  t0 = Date.now()
  await page.keyboard.press('Control+End')
  await page.waitForTimeout(500)
  out.push(['ctrl+end', await state(), await view(), await act()])
  await shot(page, `ctrl-end-${tag}`)
  await page.keyboard.press('Control+Home')
  await page.waitForTimeout(500)
  out.push(['ctrl+home', await state(), await view()])
  // 3. Shift+ホイールで右へ連打して、途中の空のセルを数える
  const resetLeft = () => g(() => { const sc = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root').querySelector('.ssg-scroll-container'); sc.scrollLeft = 0 })
  await resetLeft()
  await page.waitForTimeout(300)
  out.push(['reset left', await view()])
  await page.mouse.move(700, 500)
  const during = []
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(600, 0)
    await page.waitForTimeout(16)
    if (i % 5 === 4) during.push((await view()).blanks)
  }
  out.push(['hwheel during blanks', during])
  await page.waitForTimeout(300)
  out.push(['hwheel settled', await view()])
  // 横スクロールバーのドラッグ(つまみを右端近くまで)
  const sb = await g(() => { const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root'); const els = [...root.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 100 && getComputedStyle(e).overflowX !== 'hidden' && getComputedStyle(e).overflowX !== 'clip'); const e = els[0]; if (!e) return null; const b = e.getBoundingClientRect(); return { cls: e.className, left: b.left, right: b.right, bottom: b.bottom, sw: e.scrollWidth, cw: e.clientWidth, sl: e.scrollLeft } })
  out.push(['scroller', sb])
  if (sb) {
    await resetLeft()
    await page.waitForTimeout(300)
    const thumbX = sb.left + 30
    await page.mouse.move(thumbX, sb.bottom - 6)
    await page.mouse.down()
    const d2 = []
    for (let i = 1; i <= 10; i++) { await page.mouse.move(thumbX + i * 80, sb.bottom - 6); await page.waitForTimeout(16); d2.push((await view()).blanks) }
    await page.mouse.up()
    await page.waitForTimeout(300)
    out.push(['thumb drag blanks', d2, await view()])
  }

  // 4. ツールパネルの「列」: 列メニュー → 列の表示
  await page.evaluate(() => { window.__app.grid.scrollToTop() })
  await resetLeft()
  await page.keyboard.press('Control+Home')
  await page.waitForTimeout(300)
  c = await cellAt(4, 'm201104')
  await page.mouse.click(c.x, c.y)
  out.push(['before panel', await state()])
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(300)
  await page.click('[role=menu] [role=menuitem]:has-text("列の表示")')
  await page.waitForTimeout(500)
  const panel = await g(() => { const d = document.querySelector('[role=dialog][aria-label="ツールパネル"]'); if (!d) return null; return { items: d.querySelectorAll('[aria-pressed]').length, focus: document.activeElement?.textContent?.slice(0, 20), html: d.textContent.slice(0, 200) } })
  out.push(['panel', panel])
  await shot(page, `toolpanel-${tag}`)
  // 2011/04 を非表示に(検索欄で絞ってから)
  const search = await page.$('[role=dialog][aria-label="ツールパネル"] input')
  if (search) { await search.fill('2011/04'); await page.waitForTimeout(300) }
  const btns = await g(() => [...document.querySelectorAll('[role=dialog][aria-label="ツールパネル"] [aria-pressed]')].map((b) => `${b.getAttribute('aria-label') || b.textContent}|${b.getAttribute('aria-pressed')}`))
  out.push(['panel buttons', btns.slice(0, 6)])
  const t1 = Date.now()
  await page.click('[role=dialog][aria-label="ツールパネル"] [aria-pressed="true"]')
  await page.waitForTimeout(300)
  out.push(['after hide', await state(), await g(() => window.__app.columns().filter((c) => c.visible === false).map((c) => c.key)), Date.now() - t1])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.push(['after close', await state(), await act()])
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  out.push(['arrow after panel', await state()])
  // アクティブでない列(2011/06)を隠す。アクティブセルは 2011/02
  c = await cellAt(4, 'm201102')
  await page.mouse.click(c.x, c.y)
  out.push(['before panel 2', await state()])
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(300)
  await page.click('[role=menu] [role=menuitem]:has-text("列の表示")')
  await page.waitForTimeout(500)
  const search2 = await page.$('[role=dialog][aria-label="ツールパネル"] input')
  if (search2) { await search2.fill('2011/06'); await page.waitForTimeout(300) }
  await page.click('[role=dialog][aria-label="ツールパネル"] [aria-pressed="true"]')
  await page.waitForTimeout(300)
  out.push(['after hide other', await state(), await g(() => window.__app.columns().filter((c) => c.visible === false).map((c) => c.key))])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.push(['after close 2', await state(), await act()])
  // ツールパネルの列の並べ替え(ドラッグ)は一覧の項目の grip を探す
  const reorderUi = await g(() => { const d = document.querySelector('[role=dialog][aria-label="ツールパネル"]'); return d ? [...d.querySelectorAll('[draggable], [class*=grip], [class*=drag]')].length : 'closed' })
  out.push(['panel reorder ui', reorderUi])
  for (const o of out) console.log(JSON.stringify(o))
  console.log('--- logs')
  console.log([...new Set(logs.filter((l) => !l.includes('[vite]') && !l.includes('what it means') && !l.includes('agent repair') && !l.includes('deeper evidence') && !l.startsWith('  ') && !l.includes('React DevTools')).map((l) => l.slice(0, 300)))].join('\n'))
  await browser.close()
})()
