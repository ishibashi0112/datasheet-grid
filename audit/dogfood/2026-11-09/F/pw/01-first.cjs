const { open, shot, handle } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await shot(page, '01-initial')
  const info = await handle(page, `return { hasRef: !!g, active: g.getActiveCell(), state: g.getState(), visible: g.getVisibleRowRange(), colName: g.getColIndex('name'), colAmount: g.getColIndex('amount'), rn: g.getRowNumber(window.__estimate.rows[1].id), vi: g.getViewRowIndex(window.__estimate.rows[1].id) }`)
  console.log(JSON.stringify(info, null, 1))
  const aria = await page.evaluate(() => {
    const g = document.querySelector('[role="grid"]')
    return { rowcount: g.getAttribute('aria-rowcount'), colcount: g.getAttribute('aria-colcount'), label: g.getAttribute('aria-label') }
  })
  console.log(aria)
  console.log('LOGS', logs)
  await browser.close()
})()
