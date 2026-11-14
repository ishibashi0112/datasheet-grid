const dlgOpen = (page) => page.evaluate(() => !!document.querySelector('[data-testid=dialog]'))
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${(a.className||'').toString().slice(0,50)}[${a.getAttribute('aria-label')||a.getAttribute('placeholder')||a.textContent?.slice(0,15)||''}]` : null })
const portals = (page) => page.evaluate(() => [...document.querySelectorAll('body > *')].filter((e) => /ssg-/.test(e.className?.toString?.() || '') && getComputedStyle(e).display !== 'none' && !e.classList.contains('ssg-tooltip')).map((e) => e.className.toString().slice(0, 70)))
async function cellPos(page, rowIdx, colTitle, scope = '[data-testid=dialog]') {
  return page.evaluate(({ rowIdx, colTitle, scope }) => {
    const root = document.querySelector(scope + ' .ssg-root')
    const heads = [...root.querySelectorAll('[role=columnheader]')]
    const h = heads.find((x) => x.textContent.replace('⋮', '').trim() === colTitle)
    const hr = h.getBoundingClientRect()
    const row = [...root.querySelectorAll(`[role=row][aria-rowindex="${rowIdx + 2}"]`)].find((r) => { const b = r.getBoundingClientRect(); return b.left <= hr.left + 2 && b.right >= hr.right - 2 })
    const rr = row.getBoundingClientRect()
    return { x: hr.x + hr.width / 2, y: rr.y + rr.height / 2 }
  }, { rowIdx, colTitle, scope })
}
const cellText = (page, rowIdx, colTitle, scope = '[data-testid=dialog]') => page.evaluate(({ rowIdx, colTitle, scope }) => {
  const root = document.querySelector(scope + ' .ssg-root')
  if (!root) return '(no grid)'
  const heads = [...root.querySelectorAll('[role=columnheader]')]
  const h = heads.find((x) => x.textContent.replace('⋮', '').trim() === colTitle)
  const ci = h.getAttribute('aria-colindex')
  const c = root.querySelector(`[role=row][aria-rowindex="${rowIdx + 2}"] [role=gridcell][aria-colindex="${ci}"]`)
  return c?.textContent
}, { rowIdx, colTitle, scope })
async function openDialog(page) {
  await page.click('[data-testid=dialog-open]')
  await page.waitForSelector('[data-testid=dialog] .ssg-root')
  await page.waitForTimeout(400)
}
async function hitTest(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'none'
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 20))
    return { inside: el.contains(hit), hit: hit && `${hit.tagName}.${hit.className.toString().slice(0, 40)}`, pe: getComputedStyle(el).pointerEvents }
  }, sel)
}
module.exports = { dlgOpen, active, portals, cellPos, cellText, openDialog, hitTest }
