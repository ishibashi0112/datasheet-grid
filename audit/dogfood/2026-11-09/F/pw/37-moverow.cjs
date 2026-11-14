const { open, handle, appState } = require('./lib.cjs')
const names = (st) => st.rows.map((r) => (r.kind === 'section' ? `[${r.label}]` : r.name || '(空)')).join(' | ')
;(async () => {
  const { browser, page, logs } = await open('')
  // ラベル行(諸経費)を先頭へ moveRow
  await handle(page, `g.moveRow('sec-shokeihi', 0)`)
  await page.waitForTimeout(200)
  let st = await appState(page)
  console.log('moveRow label to 0:', names(st))
  console.log('canUndo', await handle(page, 'return g.canUndo()'))
  await handle(page, 'g.undo()'); await page.waitForTimeout(200)
  // データ行を別区分へ
  const id = (await appState(page)).rows[1].id
  await handle(page, `g.moveRow(arg, 10)`, id)
  await page.waitForTimeout(200)
  st = await appState(page)
  console.log('moveRow item to 10:', names(st))
  console.log(logs)
  await browser.close()
})()
