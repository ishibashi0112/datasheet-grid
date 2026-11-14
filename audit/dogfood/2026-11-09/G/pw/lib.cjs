const { chromium } = require('playwright')
const path = require('path')
const SHOTS = path.join(__dirname, '..', 'shots')
async function open(url, opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1400, height: 900 }, deviceScaleFactor: 1 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  const t = Date.now()
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector('[data-pane="center"].ssg-body-row', { timeout: 120000 })
  const loadMs = Date.now() - t
  return { browser, context, page, logs, loadMs }
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
module.exports = { open, shot, wait, SHOTS }
// フレームの間隔を測る(固まりの検出)
async function startJank(page) {
  await page.evaluate(() => {
    const w = window
    w.__jank = { gaps: [], long: [], running: true }
    let last = performance.now()
    const loop = (t) => {
      w.__jank.gaps.push(t - last)
      last = t
      if (w.__jank.running) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    try {
      const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__jank.long.push(Math.round(e.duration)) })
      po.observe({ entryTypes: ['longtask'] })
      w.__jank.po = po
    } catch {}
  })
}
async function stopJank(page) {
  return page.evaluate(() => {
    const j = window.__jank
    j.running = false
    j.po?.disconnect()
    const gaps = j.gaps.slice(1)
    const sorted = [...gaps].sort((a, b) => b - a)
    return { frames: gaps.length, maxGap: Math.round(sorted[0] ?? 0), top5: sorted.slice(0, 5).map(Math.round), over100: gaps.filter((g) => g > 100).length, longTasks: j.long.length, longMax: Math.max(0, ...j.long), longSum: j.long.reduce((a, b) => a + b, 0) }
  })
}
async function clickCell(page, viewRow, colKeyIndexInCenter = 0) {
  const row = page.locator('[data-pane="center"].ssg-body-row').nth(viewRow)
  const cell = row.locator('[role=gridcell]').nth(colKeyIndexInCenter)
  const b = await cell.boundingBox()
  await page.mouse.click(b.x + 10, b.y + b.height / 2)
}
module.exports.startJank = startJank
module.exports.stopJank = stopJank
module.exports.clickCell = clickCell
async function rowCount(page) {
  const t = await page.locator('.ssg-bar--bottom').innerText()
  const m = t.match(/行\s*([\d,]+)\s*\/\s*([\d,]+)/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}
async function waitCountChange(page, prev, timeout = 60000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    const c = await rowCount(page)
    const busy = await page.evaluate(() => !!document.querySelector('.ssg-root [class*="overlay"][class*="filter"], .ssg-root [class*="measuring"], .ssg-root [aria-busy="true"]'))
    if (c !== prev && !busy) return { count: c, ms: Date.now() - t }
    await new Promise((r) => setTimeout(r, 30))
  }
  return { count: await rowCount(page), ms: -1 }
}
async function openColumnFilter(page, centerColIdx) {
  // ヘッダーの ⋮ をホバーで出して押す代わりに、アクティブセルから Alt+↓
  const { clickCell } = module.exports
  await clickCell(page, 0, centerColIdx)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForSelector('.ssg-menu-panel')
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター…' }).first().click()
  await page.waitForSelector('.ssg-filter-popover')
}
module.exports.rowCount = rowCount
module.exports.waitCountChange = waitCountChange
module.exports.openColumnFilter = openColumnFilter
async function clickPaneCell(page, pane, viewRow, idx) {
  const row = page.locator(`[data-pane="${pane}"].ssg-body-row`).nth(viewRow)
  const cell = row.locator('[role=gridcell]').nth(idx)
  const b = await cell.boundingBox()
  await page.mouse.click(b.x + Math.min(10, b.width / 2), b.y + b.height / 2)
}
async function openFilterAt(page, pane, idx) {
  await clickPaneCell(page, pane, 0, idx)
  await page.keyboard.press('Alt+ArrowDown')
  await page.waitForSelector('.ssg-menu-panel')
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター…' }).first().click()
  await page.waitForSelector('.ssg-filter-popover')
}
module.exports.clickPaneCell = clickPaneCell
module.exports.openFilterAt = openFilterAt
// 見えている行の中から k 番目(0 始まり)のセルを押す。pane と列の位置を指定
async function clickVisible(page, k, pane = 'center', idx = 0, opts = {}) {
  const info = await page.evaluate(({ k, pane, idx }) => {
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
    const hdr = document.querySelector('[role=columnheader]')?.getBoundingClientRect()
    const topLimit = Math.max(sc.top, hdr ? hdr.bottom : sc.top) + 2
    const rows = [...document.querySelectorAll(`[data-pane="${pane}"].ssg-body-row`)]
      .map((r) => ({ r, b: r.getBoundingClientRect() }))
      .filter(({ b }) => b.top >= topLimit && b.bottom <= sc.bottom - 2)
      .sort((a, b) => a.b.top - b.b.top)
    const row = rows[k]
    if (!row) return null
    const cell = row.r.querySelectorAll('[role=gridcell]')[idx]
    const cb = cell.getBoundingClientRect()
    const leftRow = [...document.querySelectorAll('[data-pane="left"].ssg-body-row')].find((x) => Math.abs(x.getBoundingClientRect().top - row.b.top) < 1)
    return { x: cb.left + Math.min(12, cb.width / 2), y: cb.top + cb.height / 2, rowNo: leftRow?.querySelector('[role=rowheader]')?.textContent, ariaRowIndex: row.r.getAttribute('aria-rowindex'), text: cell.textContent.slice(0, 40) }
  }, { k, pane, idx })
  if (!info) throw new Error('no visible row ' + k)
  await page.mouse.click(info.x, info.y, opts)
  return info
}
module.exports.clickVisible = clickVisible
