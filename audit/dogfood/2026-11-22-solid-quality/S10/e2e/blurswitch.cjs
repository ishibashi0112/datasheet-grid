// 下で編集中(Enter を押さない)に上の別の注文を押す。書き込み先の注文はどれか
const { open, clickCell, getCell, activeInfo, shot, sleep } = require('./lib.cjs')
const [qs = '', how = 'click'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  const o1 = await page.evaluate(() => window.__bottom.getState && null)
  await clickCell(page, 'Lines', 'O00001-1', 'qty')
  await page.keyboard.type('99')
  console.log('editing', await activeInfo(page, 'Lines'))
  if (how === 'click') await clickCell(page, 'Orders', 'O00002', 'customer')
  else { // 上の表へ F6 で移ってから ArrowDown
    await page.keyboard.press('F6'); await page.keyboard.press('ArrowDown') }
  await sleep(500)
  console.log('after', await activeInfo(page, 'Lines'), 'top', (await activeInfo(page, 'Orders')).active)
  console.log('log', JSON.stringify(await page.evaluate(() => window.__log)))
  const dump = await page.evaluate(() => {
    // アプリの状態から O00001 / O00002 の明細の数と先頭の qty
    const b = window.__bottom
    return null
  })
  console.log('bottom first rows', await page.$$eval('[role=grid][aria-label="Lines"] [role=row][data-row-key]', (e) => [...new Set(e.map((x) => x.getAttribute('data-row-key')))].slice(0, 3)))
  console.log('O00002-1 qty', await getCell(page, 'Lines', 'O00002-1', 'qty'), 'O00001-1 qty in bottom?', await getCell(page, 'Lines', 'O00001-1', 'qty'))
  console.log('top qty O00001', await getCell(page, 'Orders', 'O00001', 'qty'), 'O00002', await getCell(page, 'Orders', 'O00002', 'qty'), 'header', await page.$eval('.bottom h2', (e) => e.textContent))
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await sleep(400)
  console.log('back O00001: O00001-1 qty', await getCell(page, 'Lines', 'O00001-1', 'qty'), 'header', await page.$eval('.bottom h2', (e) => e.textContent))
  await shot(page, 'blurswitch-' + how)
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
