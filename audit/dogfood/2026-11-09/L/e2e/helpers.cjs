// view 行(0 始まり)と列キーからセルの中心を得る
async function cellCenter(page, viewRow, key) {
  return page.evaluate(({ viewRow, key }) => {
    const rows = document.querySelectorAll(`.ssg-body-row[aria-rowindex="${viewRow + 2}"]`)
    for (const r of rows) {
      const c = r.querySelector(`[data-ssg-col-key="${key}"]`)
      if (c) { const b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height } }
    }
    return null
  }, { viewRow, key })
}
async function state(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.ssg-shell')
    const ad = shell?.getAttribute('aria-activedescendant')
    const el = ad ? document.getElementById(ad) : null
    const ae = document.activeElement
    return {
      activedescendant: ad,
      activeCell: el ? { key: el.getAttribute('data-ssg-col-key'), row: el.closest('[aria-rowindex]')?.getAttribute('aria-rowindex'), text: el.textContent } : null,
      selectedCount: document.querySelectorAll('.ssg-body-cell[aria-selected=true]').length,
      activeElement: ae ? `${ae.tagName}.${(ae.className || '').toString().slice(0, 50)}[${ae.getAttribute('type') || ''}][inputmode=${ae.getAttribute('inputmode') || ''}]` : null,
      editor: !!document.querySelector('.ssg-cell-editor'),
      footer: document.querySelector('.app-footer')?.textContent,
    }
  })
}
module.exports = { cellCenter, state }
// 列が中央ペインの見える範囲に入るように横スクロールする(準備用)
async function revealColumn(page, key, viewRow = 0) {
  for (let i = 0; i < 10; i++) {
    const r = await page.evaluate(({ key, viewRow }) => {
      const sc = document.querySelector('.ssg-scroll-container')
      const scb = sc.getBoundingClientRect()
      const left = [...document.querySelectorAll('.ssg-body-row[data-pane=left]')][0]
      const leftW = left ? left.getBoundingClientRect().width : 0
      const rows = document.querySelectorAll(`.ssg-body-row[aria-rowindex="${viewRow + 2}"]`)
      let cell = null
      for (const row of rows) { const c = row.querySelector(`[data-ssg-col-key="${key}"]`); if (c) cell = c }
      if (!cell) { sc.scrollLeft += 150; return 'moved' }
      const b = cell.getBoundingClientRect()
      const minX = scb.x + leftW
      const maxX = scb.x + sc.clientWidth
      if (b.x < minX) { sc.scrollLeft -= (minX - b.x) + 4; return 'moved' }
      if (b.right > maxX) { sc.scrollLeft += (b.right - maxX) + 4; return 'moved' }
      return 'ok'
    }, { key, viewRow })
    if (r === 'ok') return true
    await page.waitForTimeout(150)
  }
  return false
}
module.exports.revealColumn = revealColumn
async function revealRow(page, viewRow) {
  await page.evaluate((viewRow) => {
    const sc = document.querySelector('.ssg-scroll-container')
    const rh = 36
    const target = viewRow * rh - sc.clientHeight / 2
    sc.scrollTop = Math.max(0, target)
  }, viewRow)
  await page.waitForTimeout(300)
}
module.exports.revealRow = revealRow
