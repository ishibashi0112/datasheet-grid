const { open, shot } = require('./lib.cjs')
const { cellPos, cellText } = require('./dlib.cjs')
const desc = (page) => page.evaluate(() => { const a = document.activeElement; const g = a.closest('[data-testid]')?.getAttribute('data-testid'); return `${a.tagName}.${a.className.toString().slice(0, 25)}[${a.getAttribute('aria-label') || a.getAttribute('placeholder') || a.textContent.trim().slice(0, 10)}] in ${g}` })
;(async () => {
  const { browser, page, logs } = await open()
  await page.locator('button:has-text("CSV")').focus()
  const seq = []
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(80); seq.push(await desc(page)) }
  console.log('Tab sequence:\n ' + seq.join('\n '))
  const back = []
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(80); back.push(await desc(page)) }
  console.log('Shift+Tab:\n ' + back.join('\n '))
  // コピー: 売上の顧客 3 行 → 受注の顧客へ
  const SALES = '[data-testid=sales-wrap]', ORD = '[data-testid=orders-wrap]'
  await page.evaluate(() => window.scrollTo(0, 0))
  const a = await cellPos(page, 0, '顧客', SALES), b = await cellPos(page, 2, '顧客', SALES)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up()
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(200)
  await page.locator(ORD).scrollIntoViewIfNeeded()
  const c = await cellPos(page, 0, '顧客', ORD)
  await page.mouse.click(c.x, c.y)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
  console.log('pasted orders 顧客[0..2]:', await cellText(page, 0, '顧客', ORD), await cellText(page, 1, '顧客', ORD), await cellText(page, 2, '顧客', ORD))
  console.log('sales copy-range overlay still?', await page.evaluate(() => !!document.querySelector('[data-testid=sales-wrap] .ssg-copy-range-overlay')))
  const l = logs.filter((x) => !x.includes('React DevTools'))
  if (l.length) console.log('logs:', l.join('\n'))
  await browser.close()
})()
