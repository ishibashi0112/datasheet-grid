const { open, shot, handle, appState, clickCell } = require('./lib.cjs')
const log = (...a) => console.log(...a)
const names = (st) => st.rows.map((r) => (r.kind === 'section' ? `[${r.label}]` : r.name || '(空)')).join(' | ')
async function handleBox(page, viewRow) {
  const h = await page.evaluateHandle((viewRow) => {
    const rows = [...document.querySelectorAll('.ssg-body-row')].filter((r) => r.getAttribute('aria-rowindex') === String(viewRow + 2))
    for (const r of rows) { const c = r.querySelector('.ssg-row-drag-handle'); if (c) return c }
    return null
  }, viewRow)
  return h.asElement().boundingBox()
}
async function rowBox(page, viewRow) {
  const h = await page.evaluateHandle((viewRow) => [...document.querySelectorAll('.ssg-body-row[data-pane="center"]')].find((r) => r.getAttribute('aria-rowindex') === String(viewRow + 2)), viewRow)
  return h.asElement().boundingBox()
}
async function drag(page, fromView, toY) {
  const hb = await handleBox(page, fromView)
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 8, { steps: 3 })
  await page.mouse.move(hb.x + hb.width / 2, toY, { steps: 12 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(500)
}
;(async () => {
  const mode = process.argv[2] || ''
  const { browser, page, logs } = await open(mode)
  // ケース A: ページを開いてすぐ(グリッドにまだフォーカスが無い)ドラッグ → Ctrl+Z
  const t = await rowBox(page, 8)
  await drag(page, 1, t.y + t.height * 0.75)
  log('A activeElement after drag:', await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className))
  log('A canUndo', await handle(page, 'return g.canUndo()'), 'undo btn disabled', await page.getByRole('button', { name: '元に戻す' }).isDisabled())
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200)
  let st = await appState(page)
  log('A after Ctrl+Z:', names(st).slice(0, 80))
  // ケース B: セルをクリックしてからドラッグ → Ctrl+Z
  await clickCell(page, 3, '数量')
  await drag(page, 2, (await rowBox(page, 9)).y + 30)
  st = await appState(page)
  log('B after drag:', names(st).slice(0, 160))
  log('B activeElement after drag:', await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className))
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200)
  st = await appState(page)
  log('B after Ctrl+Z:', names(st).slice(0, 160))
  // ハンドルの undo
  await handle(page, 'g.undo()'); await page.waitForTimeout(200)
  st = await appState(page)
  log('after handle.undo:', names(st).slice(0, 160))
  log('LOGS', logs)
  await browser.close()
})()
