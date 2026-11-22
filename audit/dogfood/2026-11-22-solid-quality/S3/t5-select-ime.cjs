const { open, sleep, cell, val, activeRef } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5503/')
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 })
  await sleep(800)
  const cdp = await page.context().newCDPSession(page)
  const ime = async (text) => {
    for (let i = 1; i <= text.length; i++) {
      await cdp.send('Input.imeSetComposition', { text: text.slice(0, i), selectionStart: i, selectionEnd: i })
      await sleep(30)
    }
    await cdp.send('Input.insertText', { text })
    await sleep(100)
  }
  await cell(page, 'P00003', 'brand').dblclick()
  await sleep(400)
  console.log('focus in popover:', await page.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className))
  await ime('ミナト')
  await sleep(300)
  console.log('highlighted:', await page.evaluate(() => document.querySelector('.ssg-select-editor-popover [aria-selected=true], .ssg-select-editor-popover [data-active]')?.textContent))
  await page.keyboard.press('Enter')
  await sleep(300)
  console.log('brand after IME typeahead =', await val(page, 'P00003', 'brand'))
  // 英字での打ち始め(select): セルを選んで印字キー
  await cell(page, 'P00005', 'brand').click()
  await page.keyboard.press('a')
  await sleep(300)
  console.log('select after key a: popover', await page.locator('.ssg-select-editor-popover').count())
  await page.keyboard.press('Escape')
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('HUGE_FAN')).join('\n'))
  await browser.close()
})()
