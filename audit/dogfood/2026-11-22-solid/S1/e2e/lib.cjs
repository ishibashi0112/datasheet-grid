const { chromium } = require('playwright')
const path = require('path')
const SHOTS = path.join(__dirname, '..', 'shots')

async function open(url, opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true, ...opts })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`))
  await page.goto(url)
  await page.waitForSelector('.ssg-body-cell')
  await page.waitForTimeout(300)
  return { browser, context, page, logs }
}

// 中央ペインの行 × aria-colindex のセル(行は aria-rowindex)
function cellSel(rowIndex1, colIndex1) {
  return `[role="row"][aria-rowindex="${rowIndex1}"] [aria-colindex="${colIndex1}"]`
}
async function cell(page, rowIndex1, colIndex1) {
  const loc = page.locator(cellSel(rowIndex1, colIndex1)).first()
  return loc
}
async function click(page, rowIndex1, colIndex1, opts = {}) {
  const c = await cell(page, rowIndex1, colIndex1)
  const box = await c.boundingBox()
  if (!box) throw new Error(`no cell ${rowIndex1},${colIndex1}`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, opts)
  return box
}
async function text(page, r, c) {
  const l = await cell(page, r, c)
  return (await l.innerText()).trim()
}
async function shot(page, name) {
  const p = path.join(SHOTS, name + '.png')
  await page.screenshot({ path: p })
  return p
}
module.exports = { open, cell, click, text, shot, cellSel }
