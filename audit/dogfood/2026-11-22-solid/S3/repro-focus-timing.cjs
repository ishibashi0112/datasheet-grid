const { open, sleep } = require('./lib.cjs')
const label = process.argv[2]
const cityCell = (page, id) => page.locator(`.ssg-body-row[data-pane="center"][data-row-key="${id}"] [data-ssg-col-key="city"]`)
;(async () => {
  for (const gap of [0, 50, 120, 250]) {
    const { browser, page } = await open(`http://127.0.0.1:5503/?s=focus`)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(600)
    await cityCell(page, 2).dblclick(); await sleep(400)
    const b = await cityCell(page, 5).boundingBox(); const x = b.x + 30, y = b.y + 10
    await page.mouse.move(x, y)
    await page.mouse.down({ clickCount: 1 }); await page.mouse.up({ clickCount: 1 })
    await sleep(gap)
    await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 })
    await sleep(500)
    const st = await page.evaluate(() => `${document.activeElement?.tagName} editors=${document.querySelectorAll('.ssg-cell-editor').length}`)
    console.log(`[${label}] gap ${gap}ms: focus=${st}`)
    await browser.close()
  }
})()
