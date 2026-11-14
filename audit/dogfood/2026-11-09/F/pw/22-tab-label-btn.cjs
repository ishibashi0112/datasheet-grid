const { open, handle, clickCell } = require('./lib.cjs')
const log = (...a) => console.log(...a)
const act = (page) => handle(page, 'return JSON.stringify(g.getActiveCell())')
const focusDesc = (page) => page.evaluate(() => { const a = document.activeElement; const lr = a?.closest('[data-ssg-label-row]'); return (a?.tagName) + ' ' + (a?.textContent?.slice(0, 10)) + (lr ? ' in label row aria-rowindex=' + lr.getAttribute('aria-rowindex') : '') })
;(async () => {
  const { browser, page, logs } = await open('')
  await clickCell(page, 10, '備考')
  log('start', await act(page))
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); log('Tab', i + 1, await focusDesc(page)) }
  log('LOGS', logs)
  await browser.close()
})()
