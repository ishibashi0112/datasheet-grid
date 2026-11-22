// 0 時をまたいだ後: (1) 開いたままのフィルターの値の木 → 閉じて開き直す (2) 打ちかけの編集はどうなったか
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
const tree = (page) => page.evaluate(() => [...document.querySelectorAll('.ssg-filter-popover .ssg-filter-option')].map((x) => x.textContent.trim() + (x.querySelector('input')?.checked ? '[x]' : '[ ]')).join(', ') + ' | ' + document.querySelector('.ssg-filter-popover .ssg-filter-sec-meta')?.textContent)
async function openFilter(page) {
  await page.locator('[role=columnheader][data-ssg-col-key="date"]').hover()
  await page.locator('button[aria-label="日付 の列メニュー"]').click()
  await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first().click()
  await page.waitForTimeout(400)
  for (let i = 0; i < 2; i++) {
    const t = page.locator('.ssg-filter-popover .ssg-filter-tree-toggle[aria-label="展開する"]').first()
    if (await t.count()) { await t.click(); await page.waitForTimeout(150) }
  }
}
;(async () => {
  {
    const { browser, page } = await open({ timezoneId: 'Asia/Tokyo' })
    await page.clock.install({ time: new Date('2026-11-22T23:59:30+09:00') })
    await page.goto(`${BASE}/?date=today`)
    await page.waitForTimeout(1500)
    await openFilter(page)
    console.log('開いたとき:', await tree(page))
    await page.clock.runFor(60_000)
    await page.waitForTimeout(600)
    console.log('0 時の後(開いたまま):', await tree(page))
    await shot(page, 'midnight-popover-open')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await openFilter(page)
    console.log('開き直した後:', await tree(page))
    await browser.close()
  }
  {
    const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
    await page.clock.install({ time: new Date('2026-11-22T23:59:30+09:00') })
    await page.goto(`${BASE}/?date=today`)
    await page.waitForTimeout(1500)
    const cell = page.locator('[data-pane="center"][role="row"][data-row-index="0"] [role="gridcell"]').nth(5)
    await cell.dblclick()
    await page.keyboard.press('End')
    await page.keyboard.type('打ちかけ')
    await page.clock.runFor(60_000)
    await page.waitForTimeout(600)
    console.log('0 時の後のフォーカス:', await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className))
    console.log('エディタ:', await page.evaluate(() => !!document.querySelector('.ssg-cell-editor')))
    // すべてを出して 11/22 の行の用途を見る
    await page.getByRole('button', { name: 'すべて' }).click()
    await page.waitForTimeout(800)
    const csv = await page.evaluate(() => new Promise((resolve) => {
      const orig = URL.createObjectURL
      URL.createObjectURL = (blob) => { blob.text().then(resolve); return orig.call(URL, blob) }
      ;[...document.querySelectorAll('.toolbar button')].find((b) => b.textContent === 'CSV').click()
    }))
    console.log('11/22 の行:', csv.split('\n').filter((l) => l.startsWith('2026-11-22')))
    console.log(logs.filter((l) => !l.includes('vite')).map((l) => l.slice(0, 1500)).join('\n'))
    await browser.close()
  }
})()
