// 下の編集で上の合計が変わるか(3 つの書き方)と、上の元に戻すの履歴
const { open, clickCell, getCell, activeInfo, shot, sleep } = require('./lib.cjs')
const [qs = ''] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  const totalRow = () => page.evaluate(() => {
    const root = document.querySelector('[role=grid][aria-label="Orders"]').closest('.ssg-root')
    const t = root.querySelector('[class*=total-row], [data-ssg-total-row], .ssg-total-row')
    return t ? t.textContent.replace(/\s+/g, ' ').slice(0, 80) : null
  })
  // 上の note を編集
  await clickCell(page, 'Orders', 'O00001', 'note')
  await page.keyboard.type('rush')
  await page.keyboard.press('Enter')
  await sleep(200)
  console.log('top note', await getCell(page, 'Orders', 'O00001', 'note'), 'topUndo', await page.evaluate(() => window.__top.canUndo()), 'total', await totalRow())
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  const before = { qty: await getCell(page, 'Orders', 'O00001', 'qty'), amount: await getCell(page, 'Orders', 'O00001', 'amount'), head: await page.$eval('.bottom h2', (e) => e.textContent) }
  await clickCell(page, 'Lines', 'O00001-1', 'qty')
  await page.keyboard.type('100')
  await page.keyboard.press('Enter')
  await sleep(300)
  const after = { qty: await getCell(page, 'Orders', 'O00001', 'qty'), amount: await getCell(page, 'Orders', 'O00001', 'amount'), head: await page.$eval('.bottom h2', (e) => e.textContent) }
  console.log('before', JSON.stringify(before)); console.log('after ', JSON.stringify(after), 'total', await totalRow())
  console.log('topUndo', await page.evaluate(() => window.__top.canUndo()), 'bottomUndo', await page.evaluate(() => window.__bottom.canUndo()))
  // 下で Ctrl+Z → 上の合計も戻るか
  await page.keyboard.press('Control+z')
  await sleep(300)
  console.log('bottom ctrl+z: line qty', await getCell(page, 'Lines', 'O00001-1', 'qty'), 'top qty', await getCell(page, 'Orders', 'O00001', 'qty'), 'bottomUndo', await page.evaluate(() => window.__bottom.canUndo()), 'redo', await page.evaluate(() => window.__bottom.canRedo()))
  await page.keyboard.press('Control+y')
  await sleep(300)
  console.log('bottom ctrl+y: line qty', await getCell(page, 'Lines', 'O00001-1', 'qty'), 'top qty', await getCell(page, 'Orders', 'O00001', 'qty'))
  // 上へ移って Ctrl+Z → note が戻り合計は残るか
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.keyboard.press('Control+z')
  await sleep(300)
  console.log('top ctrl+z: note', JSON.stringify(await getCell(page, 'Orders', 'O00001', 'note')), 'qty', await getCell(page, 'Orders', 'O00001', 'qty'), 'topUndo', await page.evaluate(() => window.__top.canUndo()), 'redo', await page.evaluate(() => window.__top.canRedo()))
  await page.keyboard.press('Control+y')
  await sleep(300)
  console.log('top ctrl+y: note', JSON.stringify(await getCell(page, 'Orders', 'O00001', 'note')), 'qty', await getCell(page, 'Orders', 'O00001', 'qty'))
  console.log('log', JSON.stringify(await page.evaluate(() => window.__log.filter((l) => !l.startsWith('active')))))
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
