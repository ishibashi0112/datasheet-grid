const { chromium } = require('playwright')
exports.BASE = process.env.BASE ?? 'http://localhost:3501'
exports.launch = async (opts = {}) => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1, ...opts })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => {
    const t = m.text()
    if (/\[vite\] connect/.test(t)) return
    logs.push(`[${m.type()}] ${t.split('\n').slice(0, 3).join(' | ')}`)
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message} ${String(e.stack).split('\n').slice(0, 4).join(' | ')}`))
  return { browser, ctx, page, logs }
}
exports.serverLog = async (page) => (await page.request.get(exports.BASE + '/api/_log')).json()
exports.clearLog = async (page) => page.request.delete(exports.BASE + '/api/_log')
exports.chaos = async (page, c) => (await page.request.post(exports.BASE + '/api/_chaos', { data: c })).json()
exports.cell = (page, rowIdx, key) => page.locator(`.ssg-body-row[data-row-index="${rowIdx}"] [data-ssg-col-key="${key}"]`).first()
exports.sleep = (ms) => new Promise((r) => setTimeout(r, ms))
exports.openColumnMenu = async (page, key) => {
  const h = page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`).first()
  await h.hover()
  await page.waitForTimeout(150)
  const b = await h.locator('button[aria-haspopup="menu"]').boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(300)
}
exports.clickCell = async (page, rowIdx, key, opts = {}) => {
  const c = exports.cell(page, rowIdx, key)
  await c.scrollIntoViewIfNeeded().catch(() => {})
  const b = await c.boundingBox()
  if (!b) throw new Error(`cell ${rowIdx}/${key} not visible`)
  const sc = await page.locator('.ssg-scroll-container').first().boundingBox()
  const x1 = Math.max(b.x, sc.x), x2 = Math.min(b.x + b.width, sc.x + sc.width - 12)
  const x = (x1 + x2) / 2, y = b.y + b.height / 2
  if (opts.dbl) await page.mouse.dblclick(x, y)
  else await page.mouse.click(x, y)
}
exports.texts = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim()), sel)
