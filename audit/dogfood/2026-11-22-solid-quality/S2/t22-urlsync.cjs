// URL と状態の同期: 自分の版(/activity: onSortChange + onFiltersChange + 比べる)と README どおりの版(/activity2: onStateChange + applyState)
const { launch, BASE } = require('./lib.cjs')
;(async () => {
  for (const path of ['/activity', '/activity2']) {
    const { browser, page, logs } = await launch()
    await page.goto(BASE + path)
    await page.locator('.ssg-body-row:not([data-skeleton-row])').first().waitFor()
    await page.waitForTimeout(600)
    const snap = async (label) => ({ label, url: decodeURIComponent(page.url().replace(BASE, '')), hist: await page.evaluate(() => history.length), calls: await page.evaluate(() => globalThis.__stateCalls ?? null), sort: await page.locator('[role="columnheader"][data-ssg-col-key="at"]').first().getAttribute('aria-sort'), q: await page.locator('input.ssg-bar-input').first().inputValue(), chip: await page.locator('.ssg-bar--top .ssg-bar-chip').first().textContent() })
    const out = [await snap('load')]
    const h = await page.locator('[role="columnheader"][data-ssg-col-key="at"]').first().boundingBox()
    await page.mouse.click(h.x + 30, h.y + h.height / 2); await page.waitForTimeout(500)
    out.push(await snap('sort'))
    await page.locator('input.ssg-bar-input').first().click(); await page.keyboard.type('login'); await page.waitForTimeout(900)
    out.push(await snap('filter'))
    // 列の幅を変える(onStateChange は幅でも呼ばれる)
    const rz = page.locator('[role="columnheader"][data-ssg-col-key="user"] .ssg-col-resize-handle, [role="columnheader"][data-ssg-col-key="user"] [class*="resize"]').first()
    if (await rz.count()) { const b = await rz.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); for (let i = 1; i <= 5; i++) { await page.mouse.move(b.x + i * 10, b.y + b.height / 2); await page.waitForTimeout(30) } await page.mouse.up(); await page.waitForTimeout(400) }
    out.push(await snap('resize'))
    await page.goBack(); await page.waitForTimeout(700); out.push(await snap('back1'))
    await page.goBack(); await page.waitForTimeout(700); out.push(await snap('back2'))
    await page.goForward(); await page.waitForTimeout(700); out.push(await snap('fwd'))
    await page.waitForTimeout(1500); out.push(await snap('idle'))
    console.log(path); for (const o of out) console.log('  ', JSON.stringify(o))
    if (logs.length) console.log('  logs:', [...new Set(logs)].slice(0, 5).join('\n   '))
    await browser.close()
  }
})()
