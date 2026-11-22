const { open, cell } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5509/'
  const { browser, page } = await open(url)
  const dlg = () => page.evaluate(() => document.querySelector('dialog').open)
  const dg = '[aria-label="確認する明細"]'
  const state = () => page.evaluate(() => ({ overlay: document.querySelectorAll('dialog .ssg-copy-range-overlay').length, sel: JSON.stringify(window.__dialogGrid.getSelection()), active: JSON.stringify(window.__dialogGrid.getActiveCell()) }))
  for (const variant of ['single', 'range']) {
    await page.goto(url)
    await page.waitForSelector('.ssg-body-cell')
    await page.click('[data-testid=confirm]')
    await page.waitForTimeout(400)
    const a = await cell(page, 0, 'date', dg)
    if (variant === 'single') {
      await page.mouse.click(a.x, a.y)
    } else {
      const b = await cell(page, 1, 'amount', dg)
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up()
    }
    await page.waitForTimeout(150)
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(200)
    const s1 = await state()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const s2 = await state()
    const open1 = await dlg()
    let open2 = null
    let s3 = null
    if (open1) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      s3 = await state()
      open2 = await dlg()
    }
    console.log(JSON.stringify({ variant, afterCopy: s1, afterEsc1: s2, dialogOpenAfterEsc1: open1, afterEsc2: s3, dialogOpenAfterEsc2: open2 }))
  }
  await browser.close()
})()
