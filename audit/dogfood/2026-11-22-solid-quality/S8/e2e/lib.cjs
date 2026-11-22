const { chromium } = require('playwright')
const path = require('path')
const SHOTS = path.join(__dirname, '..', 'shots')

async function open(opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    timezoneId: opts.timezoneId,
    locale: 'ja-JP',
    colorScheme: opts.colorScheme,
    reducedMotion: opts.reducedMotion,
  })
  if (opts.clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  return { browser, context, page, logs }
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') })

/** 画面に出ているデータ行の「日付」列の文字(左ペイン) */
async function visibleDates(page) {
  return page.$$eval('[data-pane="left"][role="row"] .ssg-body-cell', (cells) => cells.map((c) => c.textContent.trim()).filter((t) => t))
}

async function barText(page) {
  return page.$$eval('.ssg-bar-chip', (els) => els.map((e) => e.textContent.trim()).join(' | '))
}

module.exports = { open, shot, visibleDates, barText, SHOTS }
