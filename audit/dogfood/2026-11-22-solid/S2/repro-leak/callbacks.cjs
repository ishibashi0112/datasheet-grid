const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  for (const cb of ['onSortChange', 'onFiltersChange', 'onStateChange', 'onActiveCellChange', 'onScroll', 'onCellClick', 'onRowsChange']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
    const logs = []
    page.on('console', (m) => { if (/STRICT_READ_UNTRACKED\] Reactive/.test(m.text())) logs.push(m.text().split('\n')[0]) })
    await page.goto('http://localhost:5502/callbacks.html?cb=' + cb)
    await page.waitForTimeout(1000)
    // 並べ替え(Shift+見出しクリック)・フィルター(グローバル)・セルのクリック・編集・スクロール
    const c = await page.locator('.ssg-body-row[data-row-index="1"] [data-ssg-col-key="name"]').first().boundingBox()
    await page.mouse.click(c.x + 20, c.y + 10)
    await page.keyboard.type('abc'); await page.keyboard.press('Enter')
    await page.locator('input.ssg-bar-input').fill('item')
    await page.waitForTimeout(500)
    const h = await page.locator('[role="columnheader"][data-ssg-col-key="qty"]').first().boundingBox()
    await page.keyboard.down('Shift'); await page.mouse.click(h.x + 20, h.y + 10); await page.keyboard.up('Shift')
    await page.waitForTimeout(400)
    await page.mouse.move(300, 300); await page.mouse.wheel(0, 300); await page.waitForTimeout(400)
    console.log(cb.padEnd(20), 'count=', await page.locator('#count').textContent(), 'warnings=', logs.length, logs[0]?.slice(0, 90) ?? '')
    await page.close()
  }
  await browser.close()
})()
