const { open, shot } = require('./lib.cjs')
const dlgOpen = (page) => page.evaluate(() => !!document.querySelector('[data-testid=dialog]'))
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${(a.className||'').toString().slice(0,60)}[${a.getAttribute('aria-label')||a.getAttribute('placeholder')||''}]` : null })
async function hitTest(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'none'
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 20))
    const cs = getComputedStyle(el)
    return { inside: el.contains(hit), hit: hit && hit.className.toString().slice(0, 60), pe: cs.pointerEvents, z: cs.zIndex, parent: el.parentElement.tagName }
  }, sel)
}
;(async () => {
  const { browser, page, logs } = await open()
  await page.click('[data-testid=dialog-open]')
  await page.waitForSelector('[data-testid=dialog] .ssg-root')
  await page.waitForTimeout(500)
  await shot(page, 'dialog-open')
  const cell = async (rowIdx, colTitle) => {
    return page.evaluate(({ rowIdx, colTitle }) => {
      const root = document.querySelector('[data-testid=dialog] .ssg-root')
      const heads = [...root.querySelectorAll('[role=columnheader]')]
      const h = heads.find((x) => x.textContent.replace('⋮', '').trim() === colTitle)
      const hr = h.getBoundingClientRect()
      const row = [...root.querySelectorAll(`[role=row][aria-rowindex="${rowIdx + 2}"]`)].find((r) => { const b = r.getBoundingClientRect(); return b.left <= hr.left + 2 && b.right >= hr.right - 2 })
      const rr = row.getBoundingClientRect()
      return { x: hr.x + hr.width / 2, y: rr.y + rr.height / 2 }
    }, { rowIdx, colTitle })
  }
  // 1) セルをクリック
  let p = await cell(1, '顧客名')
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(200)
  console.log('1 click cell: dialog', await dlgOpen(page), 'active', await active(page))
  // 2) 列メニュー
  const menuBtn = await page.$('[data-testid=dialog] [aria-label="地域 の列メニュー"]')
  const hb = await (await page.$('[data-testid=dialog] [aria-label="地域 の列メニュー"]')).boundingBox()
  await page.mouse.move(hb.x + 3, hb.y + 3)
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.waitForTimeout(400)
  console.log('2 menu: dialog', await dlgOpen(page), 'menu hit', JSON.stringify(await hitTest(page, '.ssg-menu-panel')), 'active', await active(page))
  await shot(page, 'dialog-colmenu')
  // メニューの「フィルター…」をクリック
  const item = page.locator('.ssg-menu-item', { hasText: 'フィルター…' }).first()
  const ib = await item.boundingBox()
  console.log('filter item box', JSON.stringify(ib))
  if (ib) await page.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2)
  await page.waitForTimeout(600)
  console.log('3 after click filter item: dialog', await dlgOpen(page), 'active', await active(page))
  await shot(page, 'dialog-filter')
  const pop = await page.evaluate(() => { const ps = [...document.querySelectorAll('body > *')].filter((e) => e.className && e.className.toString().includes('ssg')); return ps.map((e) => e.className.toString().slice(0, 80)) })
  console.log('body ssg children', JSON.stringify(pop))
  console.log(logs.join('\n'))
  await browser.close()
})()
