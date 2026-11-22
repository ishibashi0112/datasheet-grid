// theme="dark" / "auto" のとき、Shadow の中の表とポップアップの色
const { open, shot } = require('./lib.cjs')
;(async () => {
  for (const [q, scheme] of [['?popup=shadow&theme=dark&noframe=1', 'light'], ['?popup=shadow&theme=auto&noframe=1', 'dark'], ['?popup=auto&css=both&theme=dark&noframe=1', 'light'], ['?popup=body&css=both&theme=dark&noframe=1', 'light']]) {
    const { browser, page, logs } = await open({ colorScheme: scheme })
    await page.goto('http://localhost:5511/' + q); await page.waitForTimeout(1500)
    const col = (sel) => page.evaluate((sel) => {
      const sr = document.querySelector('stock-widget').shadowRoot
      const el = sr.querySelector(sel) ?? document.querySelector(sel)
      if (!el) return 'なし'
      const cs = getComputedStyle(el)
      return `${sr.contains(el) ? 'shadow' : 'document'} bg=${cs.backgroundColor} color=${cs.color}`
    }, sel)
    const out = [`--- ${q} (OS=${scheme})`]
    out.push('セル ' + await col('.ssg-body-cell'))
    await page.locator('stock-widget [role=columnheader][data-ssg-col-key="category"]').hover()
    await page.locator('stock-widget button[aria-label="カテゴリ の列メニュー"]').click(); await page.waitForTimeout(400)
    out.push('列メニュー ' + await col('[role=menu]'))
    await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first().click(); await page.waitForTimeout(500)
    out.push('列フィルター ' + await col('.ssg-filter-popover'))
    await shot(page, 'theme-' + q.replace(/[?&=]/g, '_'))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    console.log(out.join('\n'))
    await browser.close()
  }
})()
