import { createElement as h } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import { SpreadsheetGrid, numberFormatter, preloadGridPopups } from '@ishibashi0112/spreadsheet-grid'
import { createSpreadsheetGrid, standardFeatures } from '@ishibashi0112/spreadsheet-grid/lite'
import { GridAskBar } from '@ishibashi0112/spreadsheet-grid/ai'
import { localeTextEn, gridAskLocaleTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en'
import * as testing from '@ishibashi0112/spreadsheet-grid/testing'
import common from './common.cjs'
import { version } from 'react'

const { columns, rows } = common
const warnings = []
const origError = console.error, origWarn = console.warn
console.error = (...a) => { warnings.push(['error', a.map(String).join(' ')]) }
console.warn = (...a) => { warnings.push(['warn', a.map(String).join(' ')]) }

const results = {}
const tryRender = (name, el) => {
  try {
    const html = renderToString(el)
    results[name] = { ok: true, length: html.length, rows: (html.match(/ssg-body-row/g) || []).length, cells: (html.match(/role="gridcell"/g) || []).length, hasPrice: html.includes('1,000'), snippet: html.slice(0, 200) }
  } catch (e) {
    results[name] = { ok: false, error: String(e && e.stack || e) }
  }
}
tryRender('full', h(SpreadsheetGrid, { rows, columns, rowKeyGetter: (r) => r.id, height: 400 }))
tryRender('full-en-dark-class', h(SpreadsheetGrid, { rows, columns, rowKeyGetter: (r) => r.id, localeText: localeTextEn, theme: 'class', totalRow: true }))
tryRender('full-initialState', h(SpreadsheetGrid, { rows, columns, rowKeyGetter: (r) => r.id, initialState: { sort: [{ columnKey: 'qty', direction: 'desc' }], filters: { globalText: '品 4' } } }))
tryRender('full-theme-auto', h(SpreadsheetGrid, { rows, columns, theme: 'auto' }))
tryRender('full-features', h(SpreadsheetGrid, { rows, columns, rowKeyGetter: (r) => r.id, enableRowSelection: true, enableRowDrag: true, detailRow: { render: () => h('div', null, 'detail') }, find: true, fillHandle: true, imeDirectInput: true, scrollHint: true, autoHeight: true }))
tryRender('empty', h(SpreadsheetGrid, { rows: [], columns }))
tryRender('serverSide', h(SpreadsheetGrid, { columns, dataSource: { getRows: async () => ({ rows: [], totalRowCount: 0 }) } }))
const LiteGrid = createSpreadsheetGrid({ features: standardFeatures })
tryRender('lite', h(LiteGrid, { rows, columns, rowKeyGetter: (r) => r.id }))
tryRender('askbar', h(GridAskBar, { grid: { current: null }, columns, ask: async () => ({}) , localeText: gridAskLocaleTextEn }))
let preload
try { await preloadGridPopups(); preload = 'ok' } catch (e) { preload = String(e) }
console.error = origError; console.warn = origWarn
console.log(JSON.stringify({ react: version, typeofWindow: typeof window, testingExports: Object.keys(testing), numberFormatter: typeof numberFormatter, preload, results, warnings }, null, 2))
