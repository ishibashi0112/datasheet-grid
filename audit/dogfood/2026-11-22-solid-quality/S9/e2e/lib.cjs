const { chromium } = require('playwright')
const path = require('path')
const SHOTS = path.join(__dirname, '..', 'shots')
async function open(url, opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts.context })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.goto(url)
  await page.waitForSelector('.ssg-body-cell')
  await page.waitForTimeout(300)
  const cdp = await context.newCDPSession(page)
  return { browser, context, page, logs, cdp }
}
// グリッドの表示行 r、列キー key のセル
async function cell(page, r, key, gridSel = '[aria-label="経費の明細"]') {
  return page.evaluate(({ r, key, gridSel }) => {
    const h = gridSel.includes('確認') ? window.__dialogGrid : window.__grid
    const c = h.getColIndex(key)
    const root = document.querySelector(gridSel).closest('.ssg-root')
    // aria-rowindex = r + 2, aria-colindex = c + 2
    const el = root.querySelector(`[role="row"][aria-rowindex="${r + 2}"] [role="gridcell"][aria-colindex="${c + 2}"]`)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: el.textContent, cls: el.className, invalid: el.getAttribute('aria-invalid'), desc: el.getAttribute('aria-description') }
  }, { r, key, gridSel })
}
async function clickCell(page, r, key, opts) {
  const c = await cell(page, r, key)
  if (!c) throw new Error(`no cell ${r} ${key}`)
  await page.mouse.click(c.x, c.y, opts)
  return c
}
async function rows(page) { return page.evaluate(() => window.__rows()) }
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }) }
async function ime(cdp, page, composing, committed) {
  // 変換中の文字を少しずつ出してから確定する
  for (let i = 1; i <= composing.length; i++) {
    await cdp.send('Input.imeSetComposition', { text: composing.slice(0, i), selectionStart: i, selectionEnd: i })
    await page.waitForTimeout(30)
  }
  await cdp.send('Input.imeSetComposition', { text: committed, selectionStart: committed.length, selectionEnd: committed.length })
  await page.waitForTimeout(30)
  await cdp.send('Input.insertText', { text: committed })
  await page.waitForTimeout(100)
}
module.exports = { open, cell, clickCell, rows, shot, ime, SHOTS }
