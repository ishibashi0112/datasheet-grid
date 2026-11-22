// どの時点でアクティブセルが消えるか: 列メニューを開く / 閉じる / ツールパネルを開く / 列を変える(onColumnsChange)
const { open } = require('./lib.cjs')
;(async () => {
  const base = process.argv[2] || 'http://localhost:5512/'
  const { browser, page } = await open(`${base}?peer=none&nopeers&rows=50`)
  const g = (fn, arg) => page.evaluate(fn, arg)
  const out = []
  const st = () => g(() => { const h = window.__app.grid; const a = h.getActiveCell(); return a ? `${a.row}:${a.col}` : null })
  const cellAt = (rowKey, colKey) => g(({ rowKey, colKey }) => { const h = window.__app.grid; const r = h.getViewRowIndex(rowKey); const c = h.getColIndex(colKey); const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root'); const el = root.querySelector(`[role="row"][aria-rowindex="${r + 2}"] [role="gridcell"][aria-colindex="${c + 2}"]`); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }, { rowKey, colKey })
  // onColumnsChange の呼び出しと、そのときのアクティブセル
  await g(() => {
    window.__log = []
    const h = window.__app.grid
    const orig = h.getActiveCell
    window.__probe = () => { const a = h.getActiveCell(); window.__log.push(a ? `${a.row}:${a.col}` : null) }
  })
  let c = await cellAt(4, 'm201104')
  await page.mouse.click(c.x, c.y)
  out.push(['clicked', await st()])
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(300)
  out.push(['menu open', await st()])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.push(['menu esc', await st(), await g(() => document.activeElement?.className)])
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(300)
  await page.click('[role=menu] [role=menuitem]:has-text("列の表示")')
  await page.waitForTimeout(500)
  out.push(['panel open', await st()])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.push(['panel esc', await st(), await g(() => document.activeElement?.className)])
  // 列メニューの「この列の幅を自動調整」(onColumnsChange を呼ぶか分からない)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForTimeout(300)
  await page.click('[role=menu] [role=menuitem]:has-text("この列の幅を自動調整")')
  await page.waitForTimeout(300)
  out.push(['autosize', await st()])
  // 列見出しの右端をドラッグして幅を変える
  const hb = await g(() => { const h = window.__app.grid; const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root'); const e = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.getAttribute('aria-colindex') == h.getColIndex('m201105') + 2); const b = e.getBoundingClientRect(); return { x: b.right - 2, y: b.top + b.height / 2 } })
  await page.mouse.move(hb.x, hb.y); await page.mouse.down(); await page.mouse.move(hb.x + 40, hb.y, { steps: 5 }); await page.mouse.up()
  await page.waitForTimeout(300)
  out.push(['resize', await st()])
  // 利用側が columns を並べ替えて渡す(onColumnsChange を通さない)
  await page.click('[data-testid=pin-col]')
  await page.waitForTimeout(300)
  out.push(['toolbar pin (consumer)', await st()])
  for (const o of out) console.log(JSON.stringify(o))
  await browser.close()
})()
