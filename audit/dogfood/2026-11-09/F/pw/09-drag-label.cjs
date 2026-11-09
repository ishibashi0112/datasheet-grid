const { open, shot, handle, appState } = require('./lib.cjs')
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
async function drag(page, fromView, toY, name) {
  const hb = await handleBox(page, fromView)
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 8, { steps: 3 })
  await page.mouse.move(hb.x + hb.width / 2, toY, { steps: 12 })
  await page.waitForTimeout(200)
  if (name) await shot(page, name)
  await page.mouse.up()
  await page.waitForTimeout(500)
}
;(async () => {
  for (const mode of ['', '?drag=live']) {
    const { browser, page, logs } = await open(mode, { viewport: { width: 1280, height: 1000 } })
    const lastV = await handle(page, `return g.getViewRowIndex(window.__estimate.rows.find(r => r.name === '産業廃棄物処理費').id)`)
    const lab2V = await handle(page, `return g.getViewRowIndex('sec-zairyo')`)
    const lab2 = await rowBox(page, lab2V)
    await drag(page, lastV, lab2.y + lab2.height * 0.25, '09-drag-label-upper' + (mode ? '-live' : ''))
    let st = await appState(page)
    log(mode || 'ghost', 'onto label upper half:', names(st))
    const lab3V = await handle(page, `return g.getViewRowIndex('sec-shokeihi')`)
    const lab3 = await rowBox(page, lab3V)
    const fromV = await handle(page, `return g.getViewRowIndex(window.__estimate.rows.find(r => r.name === '大工工事').id)`)
    await drag(page, fromV, lab3.y + lab3.height * 0.75, '09-drag-label-lower' + (mode ? '-live' : ''))
    st = await appState(page)
    log(mode || 'ghost', 'onto label lower half:', names(st))
    log('LOGS', logs)
    await browser.close()
  }
})()
