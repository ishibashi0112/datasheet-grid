const { open, click, text } = require('./lib.cjs')
;(async () => {
  const BASE = process.env.BASE || 'http://localhost:5501/'
  for (const ime of [false, true]) {
    const { browser, page, logs } = await open(`${BASE}?tab=signal`)
    if (ime) await page.click('#btn-ime')
    await click(page, 3, 3, { clickCount: 2 }); await page.keyboard.type('Q'); await page.keyboard.press('Enter'); await page.waitForTimeout(150)
    await click(page, 4, 3) // 選択して
    await page.click('#add-name')
    await page.keyboard.type('あいう')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Delete')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    console.log('ime', ime, 'r2 name', await text(page, 3, 3), 'r3 name', await text(page, 4, 3), 'form value', JSON.stringify(await page.inputValue('#add-name')), 'active', await page.evaluate(() => JSON.stringify(window.__grid.getActiveCell())), 'focus', await page.evaluate(() => document.activeElement.id || document.activeElement.className))
    // グリッドへ戻って Ctrl+Z
    await click(page, 5, 3)
    await page.keyboard.press('Control+z'); await page.waitForTimeout(150)
    console.log('  after ctrl+z in grid r2', await text(page, 3, 3))
    console.log(logs.filter((l) => !l.includes('vite')).join('\n'))
    await browser.close()
  }
})()
