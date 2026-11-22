// 250ms ごとに上へ行が届く中で、複数行 / number エディタに 3 秒かけて打つ
const { open, sleep } = require('./lib.cjs')
const base = process.argv[2] ?? 'http://127.0.0.1:5503/?grid=group'
;(async () => {
  for (const [col, text, expect] of [['description', 'ゆっくり打つ説明の文', 'ゆっくり打つ説明の文'], ['price', '123456', '123456'], ['releasedAt', '12252025', '2025-12-25']]) {
    for (const follows of ['position', 'row']) {
      const { browser, page, logs } = await open(base + '&follows=' + follows)
      await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(600)
      await page.evaluate(() => window.__grid().scrollToRow(51, 'center')); await sleep(400)
      await page.locator(`.ssg-body-row[data-pane="center"][data-row-key="P00051"] [data-ssg-col-key="${col}"]`).click()
      await page.evaluate(() => window.__auto(250))
      if (col === 'description') { await page.keyboard.press('F2'); await sleep(100); for (const ch of text) { await page.keyboard.insertText(ch); await sleep(250) } }
      else if (col === 'releasedAt') { await page.keyboard.press('F2'); await sleep(100); await page.keyboard.type(text, { delay: 300 }) }
      else await page.keyboard.type(text, { delay: 400 })
      const st = await page.evaluate(() => ({ editors: document.querySelectorAll('.ssg-cell-editor').length, focus: document.activeElement?.tagName, value: document.activeElement?.value }))
      const count = await page.evaluate(() => window.__rows().length)
      await page.keyboard.press('Enter'); await page.evaluate(() => window.__auto(0)); await sleep(300)
      const saved = await page.evaluate((c) => window.__rows().find((r) => r.id === 'P00051')[c], col)
      const errs = logs.filter((l) => /pageerror|\[error\]/.test(l)).map((l) => l.split('\n')[0])
      console.log(`${col} follows=${follows}: rows=${count} before Enter ${JSON.stringify(st)} saved=${JSON.stringify(saved)} ok=${String(saved) === expect} ${errs.join(' ')}`)
      await browser.close()
    }
  }
})()
