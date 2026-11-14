const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  for (const item of ['このセルを編集', '下に行を挿入(すぐ編集)', 'このセルを編集(setTimeout)']) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 600, height: 600 } })
    const logs = []
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 200)) })
    await page.goto('http://127.0.0.1:5406/mini.html?case=ctx')
    await page.waitForSelector('.ssg-body-cell')
    const cell = page.locator('[role=gridcell]', { hasText: '品目 3' }).first()
    await cell.click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.getByText(item, { exact: true }).click()
    await page.waitForTimeout(400)
    const r = await page.evaluate(() => ({ started: window.__started, editor: !!document.querySelector('.ssg-cell-editor'), focus: document.activeElement?.tagName + '.' + document.activeElement?.className }))
    console.log(item, JSON.stringify(r), logs)
    await page.close()
  }
  await browser.close()
})()
