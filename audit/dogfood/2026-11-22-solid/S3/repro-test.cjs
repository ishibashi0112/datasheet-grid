// 使い方: node repro-test.cjs <ラベル>(5503 で動いている repro-solid か repro-react に対して)
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2]
const cityCell = (page, id) => page.locator(`.ssg-body-row[data-pane="center"][data-row-key="${id}"] [data-ssg-col-key="city"]`)
;(async () => {
  for (const blur of ['cancel', 'commit']) {
    const { browser, page, logs } = await open(`http://127.0.0.1:5503/?s=focus&blur=${blur}`)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(600)
    await cityCell(page, 2).dblclick(); await sleep(400)
    const init = await page.evaluate(() => window.__initialText)
    await cityCell(page, 5).dblclick(); await sleep(600)
    const st = await page.evaluate(() => ({ active: document.activeElement?.tagName + '.' + document.activeElement?.className, editors: document.querySelectorAll('.ssg-cell-editor').length }))
    await page.keyboard.press('x'); await sleep(100)
    await page.keyboard.press('Enter'); await sleep(400)
    const city5 = await cityCell(page, 5).innerText()
    console.log(`[${label}] blur=${blur}: initialText(dblclick)=${JSON.stringify(init)} after 2nd dblclick focus=${st.active} editors=${st.editors}; after typing x+Enter city5=${JSON.stringify(city5)} editorsNow=${await page.locator('.ssg-cell-editor').count()}`)
    const errs = logs.filter((l) => /error|warn/i.test(l) && !l.includes('[vite]'))
    if (errs.length) console.log(errs.join('\n'))
    await browser.close()
  }
  // 印字キーでの打ち始め
  {
    const { browser, page } = await open(`http://127.0.0.1:5503/?s=focus`)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(600)
    await cityCell(page, 3).click(); await page.keyboard.press('k'); await sleep(300)
    const a = await page.evaluate(() => window.__initialText)
    await page.keyboard.press('Escape'); await sleep(200)
    await page.keyboard.press('F2'); await sleep(300)
    const b = await page.evaluate(() => window.__initialText)
    await page.keyboard.press('Escape'); await sleep(200)
    await page.keyboard.press('Enter'); await sleep(300)
    const c = await page.evaluate(() => window.__initialText)
    console.log(`[${label}] initialText: key k=${JSON.stringify(a)} F2=${JSON.stringify(b)} Enter=${JSON.stringify(c)}`)
    await browser.close()
  }
  // ダイアログの中の最初の右クリック
  {
    const { browser, page, logs } = await open(`http://127.0.0.1:5503/?s=dialog`)
    await page.click('[data-testid=open]')
    await page.waitForSelector('dialog .ssg-body-cell', { timeout: 15000 }); await sleep(800)
    await page.locator('dialog .ssg-body-row[data-pane="center"][data-row-key="3"] [data-ssg-col-key="name"]').click({ button: 'right' }); await sleep(400)
    const first = await page.locator('.ssg-menu-panel').count()
    await page.keyboard.press('Escape'); await sleep(200)
    const dlgOpen1 = await page.evaluate(() => document.querySelector('dialog').open)
    if (!dlgOpen1) { await page.click('[data-testid=open]'); await page.waitForSelector('dialog .ssg-body-cell'); await sleep(500) }
    await page.locator('dialog .ssg-body-row[data-pane="center"][data-row-key="3"] [data-ssg-col-key="name"]').click(); await sleep(200)
    await page.locator('dialog .ssg-body-row[data-pane="center"][data-row-key="4"] [data-ssg-col-key="name"]').click({ button: 'right' }); await sleep(400)
    const second = await page.locator('.ssg-menu-panel').count()
    console.log(`[${label}] dialog: first right-click panels=${first} (dialog open after Esc=${dlgOpen1}); after left click, right-click panels=${second}`)
    await browser.close()
  }
})()
