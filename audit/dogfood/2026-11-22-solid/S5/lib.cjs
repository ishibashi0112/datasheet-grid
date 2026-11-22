const { chromium } = require('playwright')
exports.open = async function open(url, opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1400, height: 900 }, deviceScaleFactor: 1, ...(opts.context ?? {}) })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`))
  await page.goto(url)
  return { browser, context, page, logs }
}
exports.sleep = (ms) => new Promise((r) => setTimeout(r, ms))
exports.cell = (page, rowKey, colKey, pane = 'center') =>
  page.locator(`.ssg-body-row[data-pane="${pane}"][data-row-key="${rowKey}"] [data-ssg-col-key="${colKey}"]`)
exports.val = async (page, rowKey, colKey) => {
  for (const pane of ['center', 'left']) {
    const l = page.locator(`.ssg-body-row[data-pane="${pane}"][data-row-key="${rowKey}"] [data-ssg-col-key="${colKey}"]`)
    if (await l.count()) return (await l.first().innerText()).trim()
  }
  return null
}
exports.activeRef = (page) => page.evaluate(() => document.querySelector('.ssg-bar--bottom')?.innerText.match(/セル\s*(\S+)/)?.[1] ?? null)
exports.drag = async (page, from, to, steps = 12) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 2, from.y + 3, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps })
  await new Promise((r) => setTimeout(r, 150))
  await page.mouse.up()
}
exports.center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b } }
