const { chromium } = require('playwright')
const path = require('path')
const SHOTS = path.join(__dirname, '..', 'shots')
async function open(opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 1100 }, deviceScaleFactor: 1, locale: 'ja-JP', colorScheme: opts.colorScheme })
  if (opts.clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => { if (!/\[vite\]|DevTools/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`) })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  return { browser, context, page, logs }
}
const shot = (page, name, clip) => page.screenshot({ path: path.join(SHOTS, name + '.png'), clip })
module.exports = { open, shot, SHOTS }
