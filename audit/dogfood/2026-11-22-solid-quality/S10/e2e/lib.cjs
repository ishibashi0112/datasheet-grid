const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

async function open(opts = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 800 }, deviceScaleFactor: 1, ...(opts.context ?? {}) })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: opts.origin ?? 'http://localhost:5510' })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`))
  return { browser, context, page, logs }
}

/** 表示中の本体のセル(行キーではなく aria の行番号と列の見出しで) */
async function cellText(page, gridLabel, rowIdx, colIdx) {
  return page.evaluate(([label, r, c]) => {
    const grid = document.querySelector(`[role=grid][aria-label="${label}"]`)
    const cell = grid?.querySelector(`[role=row][aria-rowindex="${r}"] [aria-colindex="${c}"]`)
    return cell ? cell.textContent : null
  }, [gridLabel, rowIdx, colIdx])
}

function shot(page, name) {
  return page.screenshot({ path: path.join(__dirname, 'shots', name + '.png') })
}

function dumpLogs(logs, file) {
  fs.writeFileSync(path.join(__dirname, 'logs', file), logs.join('\n'))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
module.exports = { open, cellText, shot, dumpLogs, sleep }

async function cellBox(page, label, rowKey, colKey) {
  const sel = `[role=grid][aria-label="${label}"] [data-row-key="${rowKey}"] [data-ssg-col-key="${colKey}"]`
  const el = await page.waitForSelector(sel, { timeout: 10000 })
  return el.boundingBox()
}
async function clickCell(page, label, rowKey, colKey, opts = {}) {
  const b = await cellBox(page, label, rowKey, colKey)
  const x = b.x + b.width / 2, y = b.y + b.height / 2
  if (opts.double) await page.mouse.dblclick(x, y)
  else await page.mouse.click(x, y, opts)
}
async function getCell(page, label, rowKey, colKey) {
  return page.evaluate(([label, rowKey, colKey]) => {
    const el = document.querySelector(`[role=grid][aria-label="${label}"] [data-row-key="${rowKey}"] [data-ssg-col-key="${colKey}"]`)
    return el ? el.textContent : null
  }, [label, rowKey, colKey])
}
async function activeInfo(page, label) {
  return page.evaluate((label) => {
    const g = document.querySelector(`[role=grid][aria-label="${label}"]`)
    const act = g?.querySelector('[id$="-active-cell"]')
    const editor = document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea, .ssg-cell-editor select')
    const bar = g?.closest('.ssg-root')?.querySelector('.ssg-bar--bottom')?.textContent ?? ''
    return { active: act ? act.closest('[data-row-key]')?.getAttribute('data-row-key') + '/' + act.getAttribute('data-ssg-col-key') : null, editor: !!editor, editorValue: editor?.value ?? null, focus: document.activeElement?.className ?? null, bar }
  }, label)
}
async function setSettings(page, s) {
  await page.goto('http://localhost:5510/')
  await page.evaluate((s) => localStorage.setItem('s7-settings', JSON.stringify(s)), s)
}
module.exports.cellBox = cellBox
module.exports.clickCell = clickCell
module.exports.getCell = getCell
module.exports.activeInfo = activeInfo
module.exports.setSettings = setSettings
