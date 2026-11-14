const { open, shot, handle, appState } = require('./lib.cjs')
const log = (...a) => console.log(...a)
const names = (st) => st.rows.map((r) => (r.kind === 'section' ? `[${r.label}]` : r.name || '(空)')).join(' | ')
async function handleBox(page, viewRow) {
  const h = await page.evaluateHandle((viewRow) => {
    const rows = [...document.querySelectorAll('.ssg-body-row')].filter((r) => r.getAttribute('aria-rowindex') === String(viewRow + 2))
    for (const r of rows) { const c = r.querySelector('.ssg-row-drag-handle'); if (c) return c }
    return null
  }, viewRow)
  const el = h.asElement(); if (!el) throw new Error('no handle ' + viewRow)
  return el.boundingBox()
}
async function rowBox(page, viewRow) {
  const h = await page.evaluateHandle((viewRow) => [...document.querySelectorAll('.ssg-body-row[data-pane="center"]')].find((r) => r.getAttribute('aria-rowindex') === String(viewRow + 2)), viewRow)
  return h.asElement().boundingBox()
}
async function drag(page, fromView, toY, shotName) {
  const hb = await handleBox(page, fromView)
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 8, { steps: 3 })
  await page.mouse.move(hb.x + hb.width / 2, toY, { steps: 12 })
  await page.waitForTimeout(150)
  if (shotName) await shot(page, shotName)
  await page.mouse.up()
  await page.waitForTimeout(500)
}
;(async () => {
  for (const mode of ['ghost', 'live']) {
    const { browser, page, logs } = await open(mode === 'live' ? '?drag=live' : '')
    const moves = []
    await page.exposeFunction('noop', () => {})
    // 1. 工事の 1 行目を 材料 の 石膏ボード(view 8) の下へ
    const target = await rowBox(page, 8)
    await drag(page, 1, target.y + target.height * 0.75, `06-drag-${mode}-mid`)
    let st = await appState(page)
    log(mode, 'after drag1:', names(st))
    log(mode, 'label subtotals', JSON.stringify(st.sectionTotals))
    // 2. 材料の行を 工事の見出しの直下(先頭)へ: ラベル行の下半分へ
    const lab = await rowBox(page, 0)
    const fromV = await handle(page, `return g.getViewRowIndex(window.__estimate.rows.find(r => r.name === 'LED ダウンライト').id)`)
    await drag(page, fromV, lab.y + lab.height * 0.8)
    st = await appState(page)
    log(mode, 'after drag2 (to first of 工事):', names(st))
    // 3. 諸経費の最後の行を 材料の見出しの上半分 = 工事の末尾 へ
    const lab2V = await handle(page, `return g.getViewRowIndex('sec-zairyo')`)
    const lab2 = await rowBox(page, lab2V)
    const lastV = await handle(page, `return g.getViewRowIndex(window.__estimate.rows.find(r => r.name === '産業廃棄物処理費').id)`)
    await drag(page, lastV, lab2.y + lab2.height * 0.2, `06-drag-${mode}-tolabel`)
    st = await appState(page)
    log(mode, 'after drag3 (onto label upper half):', names(st))
    // undo x3
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(100) }
    st = await appState(page)
    log(mode, 'after 3 undo:', names(st))
    // ラベル行は掴めない
    log(mode, 'handles on label rows', await page.locator('[data-ssg-label-row] .ssg-row-drag-handle').count())
    log(mode, 'LOGS', logs)
    await browser.close()
  }
})()
