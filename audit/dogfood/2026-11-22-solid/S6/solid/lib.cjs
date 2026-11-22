const { chromium, devices } = require('playwright')
exports.BASE = process.env.BASE ?? 'http://localhost:5506/'
exports.devices = devices
exports.launch = async (opts = {}) => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, ...opts })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => { const t = m.text(); if (!/\[vite\]/.test(t)) logs.push(`[${m.type()}] ${t.split('\n').slice(0, 2).join(' | ')}`) })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  return { browser, ctx, page, logs }
}
exports.texts = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim()), sel)
exports.cell = (page, r, k, root = '') => page.locator(`${root} .ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${k}"]`).first()
exports.active = (page) => page.evaluate(() => { const a = document.querySelector('[id$="-active-cell"]'); return a ? `${a.closest('[role=row]')?.getAttribute('aria-rowindex')}/${a.getAttribute('data-ssg-col-key')}` : null })
exports.focused = (page) => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}${e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : ''}${e.textContent && e.children.length === 0 ? '"' + e.textContent.slice(0, 20) + '"' : ''}` : null })
