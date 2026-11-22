const { open, sleep, cell } = require('./lib.cjs')
;(async () => {
  for (const gap of [0, 80, 150]) {
    const { browser, page } = await open('http://127.0.0.1:5503/')
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(800)
    await cell(page, 'P00004', 'supplier').dblclick(); await sleep(500)
    const b = await cell(page, 'P00006', 'supplier').boundingBox(); const x = b.x + 30, y = b.y + 10
    await page.mouse.move(x, y)
    await page.mouse.down({ clickCount: 1 }); await page.mouse.up({ clickCount: 1 })
    await sleep(gap)
    await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 })
    await sleep(600)
    console.log(`dev app gap ${gap}: focus=${await page.evaluate(() => document.activeElement?.tagName)} editors=${await page.locator('.ssg-cell-editor').count()}`)
    await browser.close()
  }
})()
