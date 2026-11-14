const { createElement: h, version } = require('react')
const { renderToString } = require('react-dom/server')
const { SpreadsheetGrid } = require('@ishibashi0112/spreadsheet-grid')
const lite = require('@ishibashi0112/spreadsheet-grid/lite')
const ai = require('@ishibashi0112/spreadsheet-grid/ai')
const en = require('@ishibashi0112/spreadsheet-grid/locales/en')
const testing = require('@ishibashi0112/spreadsheet-grid/testing')
const { columns, rows } = require('./common.cjs')
const warnings = []
console.error = (...a) => { warnings.push(['error', a.map(String).join(' ')]) }
console.warn = (...a) => { warnings.push(['warn', a.map(String).join(' ')]) }
const results = {}
const tryRender = (name, el) => {
  try {
    const html = renderToString(el)
    results[name] = { ok: true, length: html.length, rows: (html.match(/ssg-body-row/g) || []).length, cells: (html.match(/role="gridcell"/g) || []).length }
  } catch (e) { results[name] = { ok: false, error: String(e && e.stack || e) } }
}
tryRender('full', h(SpreadsheetGrid, { rows, columns, rowKeyGetter: (r) => r.id }))
tryRender('lite', h(lite.createSpreadsheetGrid({ features: lite.standardFeatures }), { rows, columns }))
tryRender('askbar', h(ai.GridAskBar, { grid: { current: null }, columns, ask: async () => ({}) }))
tryRender('en', h(SpreadsheetGrid, { rows, columns, localeText: en.localeTextEn }))
process.stdout.write(JSON.stringify({ react: version, typeofWindow: typeof window, testing: Object.keys(testing), results, warnings }, null, 2) + '\n')
