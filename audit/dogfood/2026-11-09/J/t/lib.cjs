const { chromium } = require('playwright')
const path = require('path')
const BASE = process.env.BASE || 'http://localhost:5410'
const SHOTS = path.join(__dirname, '..', 'shots')
async function open(query = '', opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ locale: opts.locale || 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: opts.viewport || { width: 1440, height: 900 }, deviceScaleFactor: opts.dsf || 1 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.goto(BASE + '/' + query)
  await page.waitForSelector('.ssg-root')
  await page.waitForTimeout(500)
  return { browser, context, page, logs }
}
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts })
module.exports = { open, shot, BASE, SHOTS }
