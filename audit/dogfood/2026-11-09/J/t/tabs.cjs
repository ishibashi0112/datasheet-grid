const { open, shot } = require('./lib.cjs')
async function gridInfo(page, label) {
  return page.evaluate((label) => {
    const sc = [...document.querySelectorAll('.ssg-scroll-container')].find((e) => e.getAttribute('aria-label') === label)
    if (!sc) return null
    const root = sc.closest('.ssg-root')
    const heads = [...root.querySelectorAll('[role=columnheader]')].map((h) => `${h.textContent.trim()}:${Math.round(h.getBoundingClientRect().width)}`)
    const rb = root.getBoundingClientRect()
    return { root: [Math.round(rb.width), Math.round(rb.height)], scH: sc.scrollHeight, scC: sc.clientHeight, scW: sc.scrollWidth, scCW: sc.clientWidth, rows: root.querySelectorAll('.ssg-body-row').length, heads }
  }, label)
}
;(async () => {
  for (const mode of ['force', 'unmount']) {
    const { browser, page, logs } = await open(mode === 'unmount' ? '?tabs=unmount' : '')
    console.log('== mode', mode, 'before', JSON.stringify(await gridInfo(page, '在庫')))
    await page.waitForTimeout(1500)
    await page.click('[data-testid=tab-stock]')
    await page.waitForTimeout(50)
    await shot(page, `tabs-${mode}-stock-50ms`, { clip: { x: 0, y: 180, width: 1440, height: 500 } })
    await page.waitForTimeout(600)
    console.log('after open', JSON.stringify(await gridInfo(page, '在庫')))
    await shot(page, `tabs-${mode}-stock`, { clip: { x: 0, y: 180, width: 1440, height: 500 } })
    // 売上へ戻ってからもう一度
    await page.click('[data-testid=tab-sales]')
    await page.waitForTimeout(400)
    console.log('sales back', JSON.stringify(await gridInfo(page, '売上明細')))
    await shot(page, `tabs-${mode}-sales-back`, { clip: { x: 0, y: 180, width: 1440, height: 500 } })
    console.log(logs.join('\n'))
    await browser.close()
  }
})()
