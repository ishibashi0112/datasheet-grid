const { open, click, text, shot } = require('./lib.cjs')
const rowsOf = (page, ids) => page.evaluate((ids) => window.__getRows().filter((r) => ids.includes(r.id)).map((r) => ({ ...r })), ids)
;(async () => {
  const tab = process.argv[2] || 'signal'
  const { browser, page, logs } = await open(`${process.env.BASE || "http://localhost:5501/"}?tab=${tab}`)
  const out = []
  // T1 編集 → Ctrl+Z → Ctrl+Y
  await click(page, 3, 3, { clickCount: 2 }) // 行 2(P-00002) 品名
  await page.waitForTimeout(150)
  await page.keyboard.press('Control+a')
  await page.keyboard.type('緑茶 徳用')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  out.push(['edit', await text(page, 3, 3), (await rowsOf(page, [2]))[0].name, 'changes', await page.evaluate(() => window.__rowsChangeCount)])
  out.push(['canUndo btn disabled', await page.$eval('#btn-undo', (b) => b.disabled)])
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  out.push(['undo', await text(page, 3, 3), (await rowsOf(page, [2]))[0].name])
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(200)
  out.push(['redo', await text(page, 3, 3), (await rowsOf(page, [2]))[0].name])

  // T2 Excel からの貼り付け(行 3 = P-00003 の品名から右へ)
  const tsv = [
    ['貼り付け品A', '食品', '１，２００', '１５０', '', '2026/11/1', 'TRUE', 'メモ1'].join('\t'),
    ['貼り付け品B', '家電', '-5', '2000000', '', '2026/1/31', 'FALSE', '="危険"'].join('\t'),
    ['貼り付け品C', 'ない区分', '12.5', '３００', '', '11/2', '1', ''].join('\t'),
  ].join('\r\n') + '\r\n'
  await click(page, 4, 3)
  await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
  const after = await rowsOf(page, [3, 4, 5])
  out.push(['paste rows', JSON.stringify(after.map(({ id, name, category, qty, price, due, reorder, note, status }) => ({ id, name, category, qty, price, due, reorder, note, status })), null, 0)])
  out.push(['paste texts r3', await Promise.all([3, 4, 5, 6, 7, 8, 9, 10].map((c) => text(page, 4, c)))])
  out.push(['paste texts r4', await Promise.all([3, 4, 5, 6, 7, 8, 9, 10].map((c) => text(page, 5, c)))])
  out.push(['paste texts r5', await Promise.all([3, 4, 5, 6, 7, 8, 9, 10].map((c) => text(page, 6, c)))])
  const invalid = await page.$$eval('.ssg-body-cell[aria-invalid="true"]', (els) => els.map((e) => `${e.closest('[role=row]').getAttribute('aria-rowindex')}:${e.getAttribute('aria-colindex')}:${e.getAttribute('aria-description')}`))
  out.push(['invalid cells', invalid])
  await shot(page, `t1-paste-${tab}`)
  // 確定済みの行(P-00006 = 行 7)へ貼り付け → 飛ばされるはず
  await click(page, 7, 3)
  await page.evaluate((t) => navigator.clipboard.writeText(t), 'これは入らない\t文具\t1')
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(200)
  out.push(['paste to confirmed', (await rowsOf(page, [6]))[0].name])
  // undo で貼り付け前へ
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  out.push(['undo paste', JSON.stringify((await rowsOf(page, [3, 4, 5])).map((r) => [r.name, r.qty, r.due]))])
  out.push(['active after undo', await page.evaluate(() => JSON.stringify(window.__grid.getActiveCell()))])
  for (const o of out) console.log(...o.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))))
  console.log('LOGS:\n' + logs.filter((l) => !l.includes('[vite]')).join('\n'))
  await browser.close()
})()
