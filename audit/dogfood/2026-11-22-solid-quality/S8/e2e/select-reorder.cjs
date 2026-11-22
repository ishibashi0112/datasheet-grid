// select の候補を開いたまま applyState で並びが変わる → 候補を選ぶとどの行に入るか
const { open, shot } = require('./lib.cjs')
const URL_ = process.env.URL_ ?? 'http://localhost:3508/?date=thisMonth&sort=attendees.desc'
const NAME = process.env.NAME ?? 'solid'
;(async () => {
  const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
  await page.goto(URL_)
  await page.waitForTimeout(1500)
  if (process.env.SORT) await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'attendees', direction: 'desc' }] })), await page.waitForTimeout(500)
  const rowKey = (r) => page.evaluate((r) => document.querySelector(`[data-pane="center"][role="row"][data-row-index="${r}"]`)?.getAttribute('data-row-key'), r)
  const key1 = await rowKey(1)
  const center = (r) => page.locator(`[data-pane="center"][role="row"][data-row-index="${r}"] [role="gridcell"]`)
  console.log('行 1 のキー', key1, await center(1).first().evaluate((e) => e.parentElement.textContent))
  await center(1).nth(2).dblclick()
  await page.waitForTimeout(300)
  const popPos = () => page.evaluate(() => { const p = document.querySelector('.ssg-select-editor-popover'); const ed = document.querySelector('.ssg-cell-editor'); return { pop: p ? p.getBoundingClientRect().top : null, editor: ed ? ed.getBoundingClientRect().top : null, editorRowKey: ed?.closest('[data-row-key]')?.getAttribute('data-row-key') } })
  console.log('開いたとき', JSON.stringify(await popPos()))
  await page.evaluate(() => window.__grid.applyState({ sort: [] }))
  await page.waitForTimeout(600)
  console.log('並びを外した後', JSON.stringify(await popPos()))
  await shot(page, `select-reorder-${NAME}`)
  // 候補の 1 つ目(会議室 A)を押す
  await page.locator('.ssg-select-editor-popover [role=option]').first().click()
  await page.waitForTimeout(400)
  const rows = await page.evaluate((k) => {
    const all = window.__grid.getExportData ? null : null
    return [...document.querySelectorAll('[data-pane="center"][role="row"]')].filter((r) => r.getAttribute('data-row-key') === k).map((r) => r.textContent)
  }, key1)
  console.log('行キー', key1, 'の行(画面に出ていれば):', rows)
  const csv = await page.evaluate(() => new Promise((resolve) => {
    const orig = URL.createObjectURL
    URL.createObjectURL = (blob) => { blob.text().then(resolve); return orig.call(URL, blob) }
    window.__grid.downloadCsv('x.csv')
  }))
  console.log('CSV の先頭 3 行', csv.split('\n').slice(0, 3))
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).map((l) => l.slice(0, 200)).join('\n'))
  await browser.close()
})()
