const { open, sleep, cell, val } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(800)
  await cell(page, 'P00002', 'supplier').dblclick()
  await sleep(300)
  await page.keyboard.type('大阪')
  await page.keyboard.press('Enter')
  await sleep(400)
  const st = () => page.evaluate(() => ({
    activeEl: document.activeElement?.tagName + '.' + document.activeElement?.className,
    activeCells: [...document.querySelectorAll('.ssg-body-cell')].filter((c) => /active/.test(c.className)).map((c) => c.closest('.ssg-body-row')?.getAttribute('data-row-key') + ':' + c.getAttribute('data-ssg-col-key') + ':' + c.className).slice(0, 3),
    editors: document.querySelectorAll('.ssg-cell-editor').length,
    supplierEditor: document.querySelectorAll('[data-testid=supplier-editor]').length,
    list: document.querySelectorAll('[data-testid=supplier-list]').length,
  }))
  console.log('after enter', JSON.stringify(await st()))
  await cell(page, 'P00004', 'supplier').dblclick()
  await sleep(500)
  console.log('after dblclick P00004', JSON.stringify(await st()))
  await page.screenshot({ path: __dirname + '/shots/t3b.png' })
  await cell(page, 'P00006', 'supplier').dblclick()
  await sleep(500)
  console.log('after dblclick P00006', JSON.stringify(await st()))
  console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'))
  await browser.close()
})()
