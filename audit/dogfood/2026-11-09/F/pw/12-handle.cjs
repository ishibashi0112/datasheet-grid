const { open, shot, handle, appState, clickCell } = require('./lib.cjs')
const log = (...a) => console.log(...a)
;(async () => {
  const { browser, page, logs } = await open('?extra=60')
  // focus(): 件名の入力欄にフォーカス → focus() でグリッドへ
  await page.getByLabel('件名').click()
  await handle(page, 'g.focus()')
  log('after focus()', await page.evaluate(() => document.activeElement?.className))
  // focus 直後に矢印キー → 先頭のセル
  await page.keyboard.press('ArrowDown')
  log('active after ArrowDown', JSON.stringify(await handle(page, 'return g.getActiveCell()')))
  // startEditing: 数量 (view 30)
  const v = 30, c = await handle(page, `return g.getColIndex('qty')`)
  log('startEditing ret', await handle(page, `return g.startEditing(arg.v, arg.c)`, { v, c }))
  await page.waitForTimeout(200)
  log('activeElement', await page.evaluate(() => document.activeElement?.tagName + ' ' + document.activeElement?.type), 'value', await page.evaluate(() => document.activeElement?.value))
  await shot(page, '12-startEditing')
  await page.keyboard.press('Escape')
  // startEditing on label row / amount column → false
  const labV = await handle(page, `return g.getViewRowIndex('sec-shokeihi')`)
  log('startEditing label', await handle(page, `return g.startEditing(arg, 1)`, labV), 'amount', await handle(page, `return g.startEditing(3, g.getColIndex('amount'))`))
  // startEditing custom 列
  log('startEditing name', await handle(page, `return g.startEditing(5, g.getColIndex('name'))`))
  await page.waitForTimeout(300)
  log('custom editor focused', await page.evaluate(() => document.activeElement?.className))
  await page.keyboard.press('Escape')
  // scrollToRow 末尾 / sticky
  await handle(page, `g.scrollToRow(arg, { align: 'start' })`, 40)
  await page.waitForTimeout(300)
  await shot(page, '12-scrollToRow-start')
  log('scroll pos', JSON.stringify(await handle(page, 'return g.getScrollPosition()')), 'visible', JSON.stringify(await handle(page, 'return g.getVisibleRowRange()')))
  // 最終行
  const lastV = await handle(page, `return g.getViewRowIndex(window.__estimate.rows.at(-1).id)`)
  await handle(page, `g.selectCell(arg, 1, { scrollIntoView: true })`, lastV)
  await page.waitForTimeout(300)
  await shot(page, '12-select-last')
  // getRowNumber
  log('rowNumber last', await handle(page, `return g.getRowNumber(window.__estimate.rows.at(-1).id)`), 'view', lastV)
  log('state', JSON.stringify(await handle(page, 'return g.getState()')))
  log('LOGS', logs)
  await browser.close()
})()
