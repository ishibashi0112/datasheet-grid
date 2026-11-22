const { open, click, text } = require('./lib.cjs')
const count = (logs) => {
  const m = {}
  for (const l of logs) { const k = (l.match(/\[([A-Z_]+)\]/) || [])[1] || l.slice(0, 40); m[k] = (m[k] || 0) + 1 }
  return JSON.stringify(m)
}
;(async () => {
  const { browser, page, logs } = await open(`${process.env.BASE || "http://localhost:5501/"}?tab=store`)
  const head = logs.filter((l) => l.startsWith('[warning]')).length
  console.log('load', count(logs.filter((l) => l.startsWith('[warning]'))))
  logs.length = 0
  await click(page, 3, 3, { clickCount: 2 })
  await page.keyboard.type('A')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  console.log('1 edit', count(logs.filter((l) => l.startsWith('[warning]'))), 'canUndo', await page.evaluate(() => window.__grid.canUndo()))
  const sample = logs.filter((l) => l.startsWith('[warning]')).slice(0, 3)
  console.log(sample.join('\n---\n'))
  logs.length = 0
  await page.mouse.move(600, 500)
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(50) }
  await page.waitForTimeout(300)
  console.log('scroll', count(logs.filter((l) => l.startsWith('[warning]'))))
  logs.length = 0
  await page.evaluate(() => window.__grid.scrollToTop()); await page.waitForTimeout(300)
  // 5 回編集
  for (let i = 0; i < 5; i++) { await click(page, 5, 5); await page.keyboard.type(String(i + 1)); await page.keyboard.press('Enter'); await page.waitForTimeout(100) }
  console.log('5 edits', count(logs.filter((l) => l.startsWith('[warning]'))))
  // ハンドルの undo
  await page.evaluate(() => window.__grid.undo())
  await page.waitForTimeout(100)
  console.log('undo() via handle -> canUndo', await page.evaluate(() => window.__grid.canUndo()))
  // applyRows で削除 → 元に戻せるか
  await page.evaluate(() => window.__grid.applyRows((prev) => prev.slice(1)))
  await page.waitForTimeout(200)
  console.log('applyRows -> n', await page.evaluate(() => window.__getRows().length), 'canUndo', await page.evaluate(() => window.__grid.canUndo()))
  await page.evaluate(() => window.__grid.undo())
  await page.waitForTimeout(200)
  console.log('after undo n', await page.evaluate(() => window.__getRows().length))
  await browser.close()
})()
