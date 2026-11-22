const { open, sleep, cell, val } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(800)
  const st = () => page.evaluate(() => {
    const ed = document.querySelector('.ssg-cell-editor')
    const r = ed?.getBoundingClientRect()
    return {
      activeEl: document.activeElement?.tagName + '.' + (document.activeElement?.className || '').slice(0, 30),
      editors: document.querySelectorAll('.ssg-cell-editor').length,
      editorPos: r ? `${Math.round(r.x)},${Math.round(r.y)}` : null,
      list: document.querySelectorAll('[data-testid=supplier-list]').length,
      bar: document.querySelector('.ssg-bottom-bar, [class*=bottom]')?.textContent?.slice(0, 80),
    }
  })
  const box = async (k) => { const b = await cell(page, k, 'supplier').boundingBox(); return `${Math.round(b.x)},${Math.round(b.y)}` }
  console.log('P00004 cell', await box('P00004'), 'P00006 cell', await box('P00006'))
  await cell(page, 'P00004', 'supplier').dblclick()
  await sleep(500)
  console.log('after dblclick P00004', JSON.stringify(await st()))
  await cell(page, 'P00006', 'supplier').dblclick()
  await sleep(500)
  console.log('after dblclick P00006', JSON.stringify(await st()))
  await page.keyboard.type('沖縄')
  await sleep(200)
  console.log('after typing', JSON.stringify(await st()), 'input=', await page.locator('[data-testid=supplier-editor] input').inputValue().catch(() => '-'))
  await page.screenshot({ path: __dirname + '/shots/t3c.png' })
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('HUGE_FAN')).join('\n'))
  await browser.close()
})()
