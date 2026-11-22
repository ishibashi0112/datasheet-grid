const { open, clickCell, getCell, sleep } = require('./lib.cjs')
const [qs = ''] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  const tot = () => page.evaluate(() => {
    const root = document.querySelector('[role=grid][aria-label="Orders"]').closest('.ssg-root')
    const els = [...root.querySelectorAll('[class*=total]')]
    const qty = els.find((e) => e.getAttribute('data-ssg-col-key') === 'qty') ?? root.querySelector('[class*=total] [data-ssg-col-key=qty]')
    const amt = els.find((e) => e.getAttribute('data-ssg-col-key') === 'amount') ?? root.querySelector('[class*=total] [data-ssg-col-key=amount]')
    return { cls: [...new Set(els.map((e) => e.className))].slice(0, 4), qty: qty?.textContent, amount: amt?.textContent }
  })
  console.log('initial', JSON.stringify(await tot()))
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  await clickCell(page, 'Lines', 'O00001-1', 'qty')
  await page.keyboard.type('100'); await page.keyboard.press('Enter'); await sleep(300)
  console.log('after  ', JSON.stringify(await tot()), 'cell', await getCell(page, 'Orders', 'O00001', 'qty'))
  // 並べ替えで qty の昇順: 新しい値で並ぶか
  await browser.close()
})()
