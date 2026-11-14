const { chromium, devices } = require('playwright')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const SHOTS = path.join(ROOT, 'shots')
const BASE = process.env.BASE || 'http://127.0.0.1:5412/'

async function launch(contextOptions = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ deviceScaleFactor: 1, ...contextOptions })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  return { browser, context, page, logs }
}

async function shot(page, name) {
  const p = path.join(SHOTS, name + '.png')
  await page.screenshot({ path: p })
  return p
}

function iphone() {
  const d = devices['iPhone 13']
  // Chromium で使うので defaultBrowserType は捨てる。スクショは deviceScaleFactor 1
  return { viewport: d.viewport, userAgent: d.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
}
function ipad() {
  const d = devices['iPad (gen 7)']
  return { viewport: d.viewport, userAgent: d.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
}

async function cdpTouchDrag(page, cdp, from, to, steps = 10, holdMs = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await page.waitForTimeout(16)
  }
  if (holdMs) await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function cdpTap(page, cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(30)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

module.exports = { launch, shot, iphone, ipad, cdpTouchDrag, cdpTap, BASE, SHOTS, ROOT, devices }
