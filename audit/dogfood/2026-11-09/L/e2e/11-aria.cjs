const { launch, shot, BASE } = require('./lib.cjs')
const URL = process.argv[2] || BASE
const check = (page, expectedCols) => page.evaluate((expectedCols) => {
  const grid = document.querySelector('[role=grid]')
  const problems = []
  const rowEls = [...grid.querySelectorAll('[role=row]')]
  const seen = new Map()
  for (const r of rowEls) {
    const ri = r.getAttribute('aria-rowindex')
    const isHeader = !!r.querySelector('[role=columnheader]')
    const isLabel = r.classList.toString().includes('label')
    const rh = r.querySelector('.ssg-row-header-cell')
    if (rh && ri && !isHeader) {
      const num = Number(rh.textContent.trim())
      if (Number.isFinite(num) && num > 0 && !isLabel) {
        // 行番号と aria-rowindex の関係を集める
        seen.set(ri, (seen.get(ri) || []).concat(num))
      }
    }
    for (const c of r.querySelectorAll('[role=gridcell],[role=columnheader],[role=rowheader]')) {
      const key = c.getAttribute('data-ssg-col-key') || c.getAttribute('data-col-key')
      const ci = Number(c.getAttribute('aria-colindex'))
      if (key && expectedCols[key] && expectedCols[key] !== ci) problems.push(`colindex ${key}: ${ci} != ${expectedCols[key]} (row ${ri})`)
      if (!c.hasAttribute('aria-colindex')) problems.push(`no colindex: ${c.className.slice(0, 40)} key=${key} row=${ri}`)
    }
    if (!ri && !r.getAttribute('aria-hidden')) problems.push(`row without aria-rowindex: ${r.className.slice(0, 60)}`)
  }
  const pairs = [...seen.entries()].map(([ri, nums]) => [Number(ri), nums[0]])
  const offsets = [...new Set(pairs.map(([ri, n]) => ri - n))]
  const hdrs = [...grid.querySelectorAll('[role=columnheader]')].map((h) => `${h.getAttribute('aria-colindex')}:${h.textContent.replace('⋮', '').trim().slice(0, 6)}${h.getAttribute('aria-sort') ? '(' + h.getAttribute('aria-sort') + ')' : ''}`)
  const ad = document.querySelector('.ssg-shell').getAttribute('aria-activedescendant')
  const adEl = ad ? document.getElementById(ad) : null
  return {
    rowcount: grid.getAttribute('aria-rowcount'), colcount: grid.getAttribute('aria-colcount'),
    renderedRows: rowEls.length, rowindexMinusRowNumber: offsets, minRi: Math.min(...pairs.map((p) => p[0])), maxRi: Math.max(...pairs.map((p) => p[0])),
    headers: hdrs.join(' '), ad, adOk: ad ? !!adEl : null, adCell: adEl ? `${adEl.closest('[role=row]')?.getAttribute('aria-rowindex')}/${adEl.getAttribute('aria-colindex')}` : null,
    problems: problems.slice(0, 10), problemCount: problems.length,
    rowsWithoutIndex: rowEls.filter((r) => !r.getAttribute('aria-rowindex')).map((r) => `${r.className.slice(0, 50)} hidden=${r.getAttribute('aria-hidden')}`).slice(0, 5),
  }
}, expectedCols)
const cols = { area: 2, item: 3, result: 4, value: 5, unit: 6, memo: 7, photo: 8, inspectedAt: 9, inspector: 10 }
;(async () => {
  const { browser, page, logs } = await launch({ viewport: { width: 900, height: 700 }, locale: 'ja-JP' })
  await page.goto(URL); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  console.log('top', await check(page, cols))
  await page.evaluate(() => { const sc = document.querySelector('.ssg-scroll-container'); sc.scrollTop = 12000; sc.scrollLeft = 400 })
  await page.waitForTimeout(600)
  console.log('middle+right', await check(page, cols))
  // キーボードで動かして activedescendant
  const c = await page.evaluate(() => { const cell = document.querySelector('.ssg-body-row[data-pane=center] [role=gridcell]'); const b = cell.getBoundingClientRect(); return { x: b.x + 10, y: b.y + b.height / 2 } })
  await page.mouse.click(c.x, c.y + 72)
  for (const k of ['ArrowDown', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(k)
  await page.waitForTimeout(300)
  console.log('after keys', await check(page, cols))
  await page.keyboard.press('Control+End'); await page.waitForTimeout(600)
  console.log('ctrl+end', await check(page, cols))
  // 絞り込み
  await page.evaluate(() => [...document.querySelectorAll('.app-form button')].find((b) => b.textContent === '不良のみ').click()); await page.waitForTimeout(800)
  console.log('filtered', await check(page, cols))
  // 並び替え(Shift+見出し)
  const h = await page.evaluate(() => { const e = [...document.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.includes('場所')); const b = e.getBoundingClientRect(); return { x: b.x + 20, y: b.y + b.height / 2 } })
  await page.keyboard.down('Shift'); await page.mouse.click(h.x, h.y); await page.keyboard.up('Shift'); await page.waitForTimeout(800)
  console.log('sorted', await check(page, cols))
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
