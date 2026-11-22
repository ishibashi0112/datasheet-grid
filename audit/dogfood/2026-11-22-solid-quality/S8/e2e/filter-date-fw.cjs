// 列フィルターの内製の日付フィールドに全角 / 年月日 / 半角を打つ
const { open, shot } = require('./lib.cjs')
const URL_ = process.env.URL_ ?? 'http://localhost:3508/?from=2026-11-16&to=2026-11-30'
;(async () => {
  const { browser, page } = await open({ timezoneId: 'Asia/Tokyo' })
  await page.goto(URL_)
  await page.waitForTimeout(1500)
  await page.locator('[role=columnheader][data-ssg-col-key="date"]').hover()
  await page.locator('button[aria-label="日付 の列メニュー"]').click()
  await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first().click()
  await page.waitForTimeout(400)
  const from = page.locator('.ssg-filter-popover input[aria-label="開始日"]')
  for (const v of ['２０２６／１１／２０', '2026年11月21日', '２０２６－１１－２２', '2026.11.23', '2026/11/24']) {
    await from.fill('')
    await from.type(v)
    await from.press('Enter')
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => ({ value: document.querySelector('.ssg-filter-popover input[aria-label="開始日"]').value, invalid: document.querySelector('.ssg-filter-popover input[aria-label="開始日"]').getAttribute('aria-invalid'), summary: document.querySelector('.ssg-filter-popover .ssg-filter-summary')?.textContent }))
    console.log(v.padEnd(14), JSON.stringify(r))
  }
  await browser.close()
})()
