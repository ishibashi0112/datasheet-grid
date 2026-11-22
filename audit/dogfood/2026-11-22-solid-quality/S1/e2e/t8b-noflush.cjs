const { open, click, text } = require('./lib.cjs')
;(async () => {
  for (const q of ['tab=signal', 'tab=signal&noflush']) {
    const { browser, page, logs } = await open(`http://localhost:5501/?${q}`)
    await click(page, 4, 3, { clickCount: 2 })
    await page.keyboard.type('Q')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(150)
    const cu1 = await page.evaluate(() => window.__grid.canUndo())
    await page.fill('#add-name', '追加品')
    await page.press('#add-name', 'Enter')
    await page.waitForTimeout(400)
    console.log(q, 'canUndo before add', cu1, 'after add', await page.evaluate(() => window.__grid.canUndo()), 'log', await page.evaluate(() => window.__log.slice(-1)[0]), 'editing', (await page.$('.ssg-cell-editor')) !== null, 'undoBtnDisabled', await page.$eval('#btn-undo', (b) => b.disabled))
    console.log('LOGS:', logs.filter((l) => !l.includes('[vite]')).join('\n'))
    await browser.close()
  }
})()
