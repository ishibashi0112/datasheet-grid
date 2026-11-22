const { open, shot } = require('./lib.cjs')
;(async () => {
  for (const [name, url] of [['solid', 'http://localhost:3508/'], ['react', 'http://localhost:5508/cmp.html']]) {
    const { browser, page } = await open()
    await page.goto(url); await page.waitForTimeout(1500)
    for (const [key, title] of [['date', '日付'], ['room', '部屋'], ['createdAt', '登録日時']]) {
      const hdr = page.locator(`[role=columnheader][data-ssg-col-key="${key}"]`)
      await hdr.hover()
      await page.locator(`button[aria-label="${title} の列メニュー"]`).click(); await page.waitForTimeout(300)
      await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター' }).first().click(); await page.waitForTimeout(600)
      const r = await page.evaluate((key) => {
        const h = document.querySelector(`[role=columnheader][data-ssg-col-key="${key}"]`).getBoundingClientRect()
        const p = document.querySelector('.ssg-filter-popover')?.getBoundingClientRect()
        return `header x=${Math.round(h.x)}..${Math.round(h.right)} y=${Math.round(h.bottom)} | popover ${p ? `x=${Math.round(p.x)} y=${Math.round(p.y)} w=${Math.round(p.width)}` : 'なし'}`
      }, key)
      console.log(name, key, r)
      await shot(page, `filter-pos-${name}-${key}`)
      await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    }
    await browser.close()
  }
})()
