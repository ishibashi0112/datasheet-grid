const { open, sleep } = require('./lib.cjs')
const label = process.argv[2]; const n = process.argv[3] ?? '20000'
;(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5505/?n=' + n)
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 }); await sleep(1500)
  for (const wait of [300, 3000]) {
    const th = page.locator('.ssg-header-cell', { hasText: '時刻' })
    await th.hover(); await th.locator('.ssg-icon-btn').last().click(); await sleep(300)
    await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター…' }).first().click()
    await page.waitForSelector('.ssg-filter-popover', { timeout: 10000 }); await sleep(500)
    await page.locator('.ssg-filter-popover button', { hasText: '今日' }).first().click(); await sleep(wait)
    const focus = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} inPopover=${!!document.activeElement?.closest('.ssg-filter-popover')}`)
    await page.keyboard.press('Escape'); await sleep(400)
    const after = await page.locator('.ssg-filter-popover').count()
    console.log(`[${label}] n=${n} wait ${wait}ms: focus=${focus} → Esc → popovers=${after} bar=${await page.evaluate(() => document.querySelector('.ssg-bar--top')?.innerText.replace(/\s+/g, ' '))}`)
    if (after) { await page.locator('.ssg-filter-popover button', { hasText: '閉じる' }).click(); await sleep(300) }
    await page.evaluate(() => window.__logGrid.applyState({ filters: { columnFilters: {} } })); await sleep(500)
  }
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('auto-height')).join('\n'))
  await browser.close()
})()
