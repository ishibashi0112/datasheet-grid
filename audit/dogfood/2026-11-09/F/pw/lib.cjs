// Playwright の共通処理
const { chromium } = require('playwright')
const path = require('path')

const BASE = process.env.BASE || 'http://127.0.0.1:5406'
const SHOTS = path.join(__dirname, '..', 'shots')

async function open(query = '', opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    acceptDownloads: true,
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => {
    const t = m.type()
    if (t === 'warning' || t === 'error' || t === 'warn' || opts.allConsole) logs.push(`[${t}] ${m.text()}`)
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  if (process.env.PROD) query = query ? query + '&debug=1' : '?debug=1'
  await page.goto(BASE + '/' + query)
  await page.waitForSelector('.ssg-body-cell')
  await page.waitForTimeout(300)
  return { browser, context, page, logs }
}

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts })

// 表示中のセル(中央ペイン)をテキストで取る
async function cellText(page, viewRow, colKeyTitle) {
  return page.evaluate(
    ({ viewRow, colKeyTitle }) => {
      const headers = [...document.querySelectorAll('[role="columnheader"]')]
      const h = headers.find((x) => x.textContent.trim().startsWith(colKeyTitle))
      if (!h) return null
      const ci = h.getAttribute('aria-colindex')
      const row = [...document.querySelectorAll('.ssg-body-row')].find(
        (r) => r.getAttribute('aria-rowindex') === String(viewRow + 2) && r.querySelector(`[aria-colindex="${ci}"]`),
      )
      if (!row) return null
      return row.querySelector(`[aria-colindex="${ci}"]`).textContent
    },
    { viewRow, colKeyTitle },
  )
}

// 列見出しのタイトル → 中央にあるセルの位置
async function cellBox(page, viewRow, title) {
  const handle = await page.evaluateHandle(
    ({ viewRow, title }) => {
      const headers = [...document.querySelectorAll('[role="columnheader"]')]
      const h = headers.find((x) => x.textContent.trim().startsWith(title))
      if (!h) return null
      const ci = h.getAttribute('aria-colindex')
      const rows = [...document.querySelectorAll('.ssg-body-row')].filter(
        (r) => r.getAttribute('aria-rowindex') === String(viewRow + 2),
      )
      for (const r of rows) {
        const c = r.querySelector(`[role="gridcell"][aria-colindex="${ci}"]`)
        if (c) return c
      }
      return null
    },
    { viewRow, title },
  )
  const el = handle.asElement()
  if (!el) throw new Error(`cell not found ${viewRow} ${title}`)
  return el.boundingBox()
}

async function clickCell(page, viewRow, title, opts = {}) {
  const b = await cellBox(page, viewRow, title)
  const x = b.x + (opts.dx ?? b.width / 2)
  const y = b.y + b.height / 2
  if (opts.double) await page.mouse.dblclick(x, y)
  else await page.mouse.click(x, y)
  await page.waitForTimeout(opts.wait ?? 120)
}

const appState = (page) =>
  page.evaluate(() => {
    const e = window.__estimate
    return { rows: e.rows, grandTotal: e.grandTotal, sectionTotals: [...e.sectionTotals.entries()] }
  })

const handle = (page, fn, arg) =>
  page.evaluate(
    ({ src, arg }) => {
      const g = window.__estimate.gridRef.current
      // eslint-disable-next-line no-new-func
      return new Function('g', 'arg', src)(g, arg)
    },
    { src: fn, arg },
  )

module.exports = { open, shot, cellText, cellBox, clickCell, appState, handle, BASE, SHOTS }
