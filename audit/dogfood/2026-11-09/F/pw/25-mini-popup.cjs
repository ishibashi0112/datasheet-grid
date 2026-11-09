const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 600, height: 500 } })
  const logs = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 200)) })
  await page.goto('http://127.0.0.1:5406/mini.html?case=popup')
  await page.waitForSelector('.ssg-body-cell')
  // 最後の行(12)を編集
  await page.evaluate(() => { const g = window.__mini.ref.current; g.startEditing(11, g.getColIndex('name')) })
  await page.waitForTimeout(300)
  const info = await page.evaluate(() => {
    const ul = document.getElementById('popup'); const r = ul.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + 20, r.top + 10)
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
    return { popupTop: Math.round(r.top), popupBottom: Math.round(r.bottom), scrollBottom: Math.round(sc.bottom), hit: hit?.className + ' ' + hit?.textContent?.slice(0, 10) }
  })
  console.log('last row:', JSON.stringify(info))
  await page.screenshot({ path: __dirname + '/../shots/25-mini-popup-last.png' })
  await page.keyboard.press('Escape')
  // 中ほどの行(3)
  await page.evaluate(() => { const g = window.__mini.ref.current; g.startEditing(3, g.getColIndex('name')) })
  await page.waitForTimeout(300)
  const info2 = await page.evaluate(() => { const ul = document.getElementById('popup'); const r = ul.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 20, r.top + 10); return { hit: hit?.tagName + ' ' + hit?.textContent?.slice(0, 10) } })
  console.log('row 3:', JSON.stringify(info2))
  await page.screenshot({ path: __dirname + '/../shots/25-mini-popup-mid.png' })
  console.log(logs)
  await browser.close()
})()
